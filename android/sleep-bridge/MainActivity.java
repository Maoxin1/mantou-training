package app.mantou.sleep.bridge;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.health.connect.HealthConnectException;
import android.health.connect.HealthConnectManager;
import android.health.connect.ReadRecordsRequestUsingFilters;
import android.health.connect.ReadRecordsResponse;
import android.health.connect.TimeInstantRangeFilter;
import android.health.connect.datatypes.SleepSessionRecord;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.OutcomeReceiver;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public final class MainActivity extends Activity {
  private static final String READ_SLEEP = "android.permission.health.READ_SLEEP";
  private static final String CHROME = "com.android.chrome";
  private static final DateTimeFormatter ISO_MILLIS = new DateTimeFormatterBuilder().appendInstant(3).toFormatter();
  private final Handler handler = new Handler(Looper.getMainLooper());
  private final Set<Long> seenPages = new HashSet<>();
  private final JSONArray records = new JSONArray();
  private TextView status;
  private String ticket, key;
  private LocalDate from, through;
  private TimeInstantRangeFilter range;
  private int generation;
  private boolean running;

  @Override public void onCreate(Bundle saved) {
    super.onCreate(saved);
    LinearLayout view = new LinearLayout(this);
    view.setOrientation(LinearLayout.VERTICAL);
    view.setPadding(32, 96, 32, 32);
    status = new TextView(this);
    status.setTextSize(20);
    view.addView(status);
    Button open = new Button(this);
    open.setText("打开训练卡");
    open.setOnClickListener(v -> openChrome(BuildOrigin.URL + "/"));
    view.addView(open);
    setContentView(view);
    status.setText("请在安卓 Chrome 的训练卡记录页点击「一键导入近 7 天睡眠」。");

    Intent intent = getIntent();
    Uri uri = intent.getData();
    if (!Intent.ACTION_VIEW.equals(intent.getAction()) || uri == null ||
        !"mantou-sleep://import/sleep".equals(uri.toString())) return;
    ticket = intent.getStringExtra("ticket");
    key = intent.getStringExtra("key");
    if (!BuildOrigin.URL.equals(intent.getStringExtra("site")) ||
        ticket == null || !ticket.matches("[A-Za-z0-9_-]{22}") ||
        key == null || !key.matches("[A-Za-z0-9_-]{43}")) {
      status.setText("此导入请求不适用于当前安装的睡眠小工具。请从匹配的训练卡地址重试。");
      return;
    }
    if (checkSelfPermission(READ_SLEEP) == PackageManager.PERMISSION_GRANTED) begin();
    else requestPermissions(new String[]{READ_SLEEP}, 1);
  }

  @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] grants) {
    super.onRequestPermissionsResult(code, permissions, grants);
    if (code != 1) return;
    if (checkSelfPermission(READ_SLEEP) == PackageManager.PERMISSION_GRANTED) begin();
    else finishWithError("permission");
  }

  private void begin() {
    through = LocalDate.now();
    from = through.minusDays(6);
    range = new TimeInstantRangeFilter.Builder()
      .setStartTime(from.minusDays(2).atStartOfDay(ZoneOffset.UTC).toInstant())
      .setEndTime(through.plusDays(2).atStartOfDay(ZoneOffset.UTC).toInstant()).build();
    running = true;
    int request = ++generation;
    status.setText("正在读取近 7 天的睡眠…");
    handler.postDelayed(() -> {
      if (running && generation == request) finishWithError("unavailable");
    }, 25000);
    readPage(-1, request);
  }

  private void readPage(long token, int request) {
    if (!running || generation != request) return;
    if (seenPages.size() >= 32 || !seenPages.add(token)) {
      finishWithError("limit");
      return;
    }
    var builder = new ReadRecordsRequestUsingFilters.Builder<>(SleepSessionRecord.class)
      .setTimeRangeFilter(range).setPageSize(32);
    if (token == -1) builder.setAscending(true);
    else builder.setPageToken(token);
    try {
      HealthConnectManager manager = getSystemService(HealthConnectManager.class);
      manager.readRecords(builder.build(), getMainExecutor(),
        new OutcomeReceiver<ReadRecordsResponse<SleepSessionRecord>,HealthConnectException>() {
          @Override public void onResult(ReadRecordsResponse<SleepSessionRecord> page) {
            if (!running || generation != request) return;
            try {
              for (SleepSessionRecord record : page.getRecords()) {
                ZoneOffset offset = record.getEndZoneOffset();
                if (offset != null) {
                  LocalDate date = record.getEndTime().atOffset(offset).toLocalDate();
                  if (date.isBefore(from) || date.isAfter(through)) continue;
                }
                if (records.length() >= 64) {
                  finishWithError("limit");
                  return;
                }
                records.put(summary(record));
              }
              if (page.getNextPageToken() != -1) readPage(page.getNextPageToken(), request);
              else returnToCard(new JSONObject().put("version", 1).put("records", records));
            } catch (RuntimeException | JSONException error) {
              finishWithError("unavailable");
            }
          }
          @Override public void onError(HealthConnectException error) {
            if (running && generation == request) finishWithError("unavailable");
          }
        });
    } catch (RuntimeException error) {
      finishWithError("unavailable");
    }
  }

  private static JSONObject summary(SleepSessionRecord record) throws JSONException {
    long start = record.getStartTime().toEpochMilli(), end = record.getEndTime().toEpochMilli();
    ZoneOffset startZone = record.getStartZoneOffset(), endZone = record.getEndZoneOffset();
    var metadata = record.getMetadata();
    return new JSONObject().put("source", "Health Connect").put("id", metadata.getId())
      .put("origin", metadata.getDataOrigin().getPackageName())
      .put("lastModified", ISO_MILLIS.format(metadata.getLastModifiedTime()))
      .put("start", ISO_MILLIS.format(Instant.ofEpochMilli(start))).put("end", ISO_MILLIS.format(Instant.ofEpochMilli(end)))
      .put("startOffsetSeconds", startZone == null ? JSONObject.NULL : startZone.getTotalSeconds())
      .put("endOffsetSeconds", endZone == null ? JSONObject.NULL : endZone.getTotalSeconds())
      .put("date", endZone == null ? JSONObject.NULL : Instant.ofEpochMilli(end).atOffset(endZone).toLocalDate().toString())
      .put("intervalMinutes", (end - start) / 60000.0).put("actualMinutes", actualMinutes(record, start, end));
  }

  private static Object actualMinutes(SleepSessionRecord record, long start, long end) {
    var stages = new ArrayList<>(record.getStages());
    stages.sort(Comparator.comparing(SleepSessionRecord.Stage::getStartTime));
    long cursor = start, asleep = 0;
    for (var stage : stages) {
      long a = stage.getStartTime().toEpochMilli(), b = stage.getEndTime().toEpochMilli();
      int type = stage.getType();
      if (a != cursor || b <= a || b > end || type < 1 || type > 7) return JSONObject.NULL;
      if (type == 2 || type == 4 || type == 5 || type == 6) asleep += b - a;
      cursor = b;
    }
    return cursor == end && !stages.isEmpty() ? asleep / 60000.0 : JSONObject.NULL;
  }

  private void finishWithError(String error) {
    try {
      returnToCard(new JSONObject().put("version", 1).put("error", error));
    } catch (JSONException impossible) {
      status.setText("读取中断，请回训练卡重试。");
    }
  }

  private void returnToCard(JSONObject payload) {
    running = false;
    generation++;
    try {
      if (payload.has("records") && checkSelfPermission(READ_SLEEP) != PackageManager.PERMISSION_GRANTED) {
        finishWithError("permission");
        return;
      }
      String sealed = Envelope.seal(ticket, key, payload.toString());
      if (sealed.length() > 36000) {
        finishWithError("limit");
        return;
      }
      key = null;
      openChrome(BuildOrigin.URL + "/#mantou-sleep=" + sealed);
    } catch (Exception error) {
      key = null;
      status.setText("无法返回睡眠结果，请回训练卡重试。");
    }
  }

  private void openChrome(String link) {
    try {
      startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(link)).setPackage(CHROME));
      finish();
    } catch (RuntimeException error) {
      status.setText("无法打开安卓 Chrome，请在 Chrome 的训练卡里重试。");
    }
  }

  @Override protected void onStop() {
    if (running) {
      running = false;
      generation++;
      key = null;
      status.setText("读取已中断，请从训练卡重新点击导入。");
    }
    super.onStop();
  }

  @Override protected void onDestroy() {
    generation++;
    key = null;
    handler.removeCallbacksAndMessages(null);
    super.onDestroy();
  }
}
