package co.oktan.hesap;

import android.app.NotificationManager;
import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.PowerManager;
import android.provider.MediaStore;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/** Site (index.html) ile telefon arasındaki köprü: window.OktanNative */
final class Bridge {
    private final MainActivity a;
    Bridge(MainActivity a) { this.a = a; }

    private Context c() { return a.getApplicationContext(); }

    @JavascriptInterface
    public void login() {
        a.runOnUiThread(a::openLogin);
    }

    @JavascriptInterface
    public void setSession(String uid, String refreshToken) {
        String old = Store.uid(c());
        if (old != null && !old.equals(uid)) Scheduler.cancelAll(c());
        Store.setSession(c(), uid, refreshToken);
        Sync.start(c());
        Sync.now(c());
    }

    @JavascriptInterface
    public void clearSession() {
        if (Store.uid(c()) == null) return;
        Scheduler.cancelAll(c());
        Store.clear(c());
    }

    @JavascriptInterface
    public void setPlan(String json) {
        if (Store.savePlan(c(), json)) Scheduler.apply(c(), false);
    }

    @JavascriptInterface
    public String status() {
        try {
            Context c = c();
            NotificationManager nm = c.getSystemService(NotificationManager.class);
            PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
            JSONObject o = new JSONObject();
            o.put("notif", nm.areNotificationsEnabled());
            o.put("exact", Scheduler.canExact(c));
            o.put("battery", pm.isIgnoringBatteryOptimizations(c.getPackageName()));
            o.put("count", Store.scheduled(c).size());
            o.put("version", BuildConfig.VERSION_NAME);
            return o.toString();
        } catch (Exception e) {
            return "{}";
        }
    }

    @JavascriptInterface
    public void test() {
        Scheduler.test(c(), 5000);
    }

    @JavascriptInterface
    public void fixPermissions() {
        a.runOnUiThread(() -> a.fixPermissions(true));
    }

    /** Yedek dosyasını İndirilenler klasörüne kaydeder. */
    @JavascriptInterface
    public void saveText(String name, String text) {
        String safe = name.replaceAll("[^A-Za-z0-9._-]", "_");
        boolean ok = false;
        try {
            byte[] data = text.getBytes(StandardCharsets.UTF_8);
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues v = new ContentValues();
                v.put(MediaStore.Downloads.DISPLAY_NAME, safe);
                v.put(MediaStore.Downloads.MIME_TYPE, "application/json");
                v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                Uri u = c().getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                if (u != null) try (OutputStream os = c().getContentResolver().openOutputStream(u)) { os.write(data); ok = true; }
            } else {
                File f = new File(c().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), safe);
                try (FileOutputStream os = new FileOutputStream(f)) { os.write(data); ok = true; }
            }
        } catch (Exception ignored) { }
        final boolean done = ok;
        a.runOnUiThread(() -> Toast.makeText(a, done ? "Yedek İndirilenler klasörüne kaydedildi: " + safe
                : "Yedek kaydedilemedi", Toast.LENGTH_LONG).show());
    }

    @JavascriptInterface
    public String updateInfo() {
        return Updater.info();
    }

    @JavascriptInterface
    public void checkUpdate() {
        Updater.check();
    }

    @JavascriptInterface
    public void startUpdate() {
        a.runOnUiThread(() -> Updater.start(a));
    }
}
