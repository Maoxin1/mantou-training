package app.mantou.sleep.bridge;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

final class Envelope {
  private static final SecureRandom random = new SecureRandom();
  private static final Base64.Encoder encoder = Base64.getUrlEncoder().withoutPadding();

  static String seal(String ticket, String key, String message) throws GeneralSecurityException {
    if (!ticket.matches("[A-Za-z0-9_-]{22}") || !key.matches("[A-Za-z0-9_-]{43}")) {
      throw new GeneralSecurityException("Invalid request");
    }
    byte[] iv = new byte[12];
    random.nextBytes(iv);
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(Base64.getUrlDecoder().decode(key), "AES"),
      new GCMParameterSpec(128, iv));
    cipher.updateAAD(ticket.getBytes(StandardCharsets.UTF_8));
    byte[] encrypted = cipher.doFinal(message.getBytes(StandardCharsets.UTF_8));
    return ticket + "." + encoder.encodeToString(iv) + "." + encoder.encodeToString(encrypted);
  }
}
