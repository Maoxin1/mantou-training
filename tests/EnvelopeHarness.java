package app.mantou.sleep.bridge;

public class EnvelopeHarness {
  public static void main(String[] args) throws Exception {
    System.out.println(Envelope.seal(args[0], args[1], args[2]));
  }
}
