package app.mantou.sleep

import android.app.Activity
import android.os.Bundle
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

class PolicyActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(TextView(this).apply { text = "隐私说明\n\n本诊断版只在您点击时读取最近7天的睡眠记录，在此手机显示时间、数据来源及阶段数量。无联网权限，不上传、不写入健康数据、不保存记录文件。\n\n可随时在健康数据共享中撤销本应用的睡眠读取权限。"; textSize = 18f; setPadding(32,64,32,32) })
    }
}

class MainActivity : ComponentActivity() {
    private lateinit var output: TextView
    private lateinit var readButton: Button
    private val permissions = setOf(HealthPermission.getReadPermission(SleepSessionRecord::class))
    private val requestPermission = registerForActivityResult(PermissionController.createRequestPermissionResultContract()) { granted ->
        if (granted.containsAll(permissions)) readSleep() else output.text = "未获得睡眠读取权限。未读取任何记录，可点击按钮重试。"
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val layout = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(32,64,32,32) }
        layout.addView(TextView(this).apply { text = "mantou · 睡眠诊断"; textSize = 26f })
        layout.addView(TextView(this).apply { text = "只读取最近7天，结果仅显示在手机。诊断版不会上传或自动同步到训练卡。"; textSize = 16f; setPadding(0,24,0,24) })
        readButton = Button(this).apply { text = "检查睡眠记录"; setOnClickListener { checkPermission() } }
        layout.addView(readButton)
        output = TextView(this).apply { text = "点击上方按钮开始。"; textSize = 16f; setPadding(0,24,0,0); setTextIsSelectable(true) }
        layout.addView(output)
        setContentView(ScrollView(this).apply { addView(layout, ViewGroup.LayoutParams(-1,-2)) })
    }
    private fun checkPermission() {
        val status = HealthConnectClient.getSdkStatus(this)
        if (status != HealthConnectClient.SDK_AVAILABLE) {
            output.text = if (status == HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) "Health Connect需要安装或更新（SDK状态$status）。" else "本机Health Connect API不可用（SDK状态$status）。"
            return
        }
        lifecycleScope.launch {
            try {
                val client = HealthConnectClient.getOrCreate(this@MainActivity)
                if (client.permissionController.getGrantedPermissions().containsAll(permissions)) readSleep() else requestPermission.launch(permissions)
            } catch (e: Exception) { output.text = "权限检查失败：${e.javaClass.simpleName}。未修改任何数据。" }
        }
    }
    private fun readSleep() {
        readButton.isEnabled = false
        output.text = "正在读取最近7天……"
        lifecycleScope.launch {
            try {
                val client = HealthConnectClient.getOrCreate(this@MainActivity)
                if (!client.permissionController.getGrantedPermissions().containsAll(permissions)) throw SecurityException()
                val end = Instant.now()
                val start = end.minus(7, ChronoUnit.DAYS)
                val rows = mutableListOf<SleepSessionRecord>()
                var token: String? = null
                do {
                    val response = client.readRecords(ReadRecordsRequest(SleepSessionRecord::class, TimeRangeFilter.between(start,end), pageSize = 100, pageToken = token))
                    rows.addAll(response.records)
                    token = response.pageToken
                    if (rows.size > 1000) error("Too many records")
                } while (token != null)
                val origins = rows.groupingBy { it.metadata.dataOrigin.packageName }.eachCount()
                val formatter = DateTimeFormatter.ofPattern("MM-dd HH:mm").withZone(ZoneId.systemDefault())
                output.text = buildString {
                    append("Health Connect可用\n睡眠读取权限：已授权\n最近7天睡眠记录：${rows.size}条\n")
                    if (rows.isEmpty()) append("\nAPI当前也没有返回睡眠记录。这不代表您没有睡眠；问题在上游写入或记录可见性，训练卡尚未接收任何数据。\n")
                    for ((origin,count) in origins) append("\n来源：$origin，$count 条\n")
                    for (r in rows.sortedByDescending { it.endTime }.take(12)) {
                        append("\n${formatter.format(r.startTime)} → ${formatter.format(r.endTime)}\n来源：${r.metadata.dataOrigin.packageName}\n阶段：${r.stages.size}段\n")
                    }
                    append("\n仅显示本次诊断；未上传、未保存、未改动任何健康记录。")
                }
            } catch (e: SecurityException) {
                output.text = "睡眠读取权限未授予或已撤销。未把读取失败当作0条记录。"
            } catch (e: Exception) {
                output.text = "读取失败：${e.javaClass.simpleName}。这不是0条睡眠记录，请将此提示反馈。"
            } finally { readButton.isEnabled = true }
        }
    }
}
