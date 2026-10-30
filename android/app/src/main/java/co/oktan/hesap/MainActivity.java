package co.oktan.hesap;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.NotificationManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** Siteyi açan ana ekran. Hatırlatma işleri arka planda Scheduler/Sync ile yürür. */
public class MainActivity extends Activity {
    private static final int FILES = 11;
    private WebView web;
    private ValueCallback<Uri[]> filesCb;
    /** Chrome'da yapılan Google girişinden dönen anahtar; sayfa yüklenince siteye verilir. */
    private String pendingLogin;

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setUserAgentString(s.getUserAgentString() + " OktanApp/" + BuildConfig.VERSION_NAME);
        web.addJavascriptInterface(new Bridge(this), Config.JS_NAME);
        web.setWebChromeClient(new WebChromeClient() {
            // Fotoğraf/PDF içe aktarma ve yedek geri yükleme için dosya seçici
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (filesCb != null) filesCb.onReceiveValue(null);
                filesCb = cb;
                Intent i = p.createIntent();
                i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, p.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                String[] types = p.getAcceptTypes();
                if (types != null && types.length > 1) {
                    java.util.List<String> mimes = new java.util.ArrayList<>();
                    for (String t : types) if (t != null && t.contains("/")) mimes.add(t.trim());
                    if (mimes.size() > 1) { i.setType("*/*"); i.putExtra(Intent.EXTRA_MIME_TYPES, mimes.toArray(new String[0])); }
                }
                try { startActivityForResult(i, FILES); } catch (Exception e) { filesCb = null; return false; }
                return true;
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (Config.APP_HOST.equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                deliverLogin();
            }

            @Override
            public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (r.isForMainFrame()) v.loadDataWithBaseURL(null, offlinePage(), "text/html", "utf-8", null);
            }
        });

        pendingLogin = loginToken(getIntent());
        if (state != null) web.restoreState(state);
        else web.loadUrl(Config.APP_URL);

        Notifier.channels(this);
        Scheduler.apply(this, false);
        Sync.start(this);
        fixPermissions(false);
    }

    /** oktanhesap://login?t=... bağlantısından Google anahtarını alır. */
    private static String loginToken(Intent i) {
        if (i == null || i.getData() == null) return null;
        Uri u = i.getData();
        if (!"oktanhesap".equals(u.getScheme()) || !"login".equals(u.getHost())) return null;
        String t = u.getQueryParameter("t");
        return t == null || t.isEmpty() ? null : t;
    }

    @Override
    protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        setIntent(i);
        String t = loginToken(i);
        if (t != null) { pendingLogin = t; deliverLogin(); }
    }

    private void deliverLogin() {
        if (pendingLogin == null || web == null) return;
        String t = org.json.JSONObject.quote(pendingLogin);
        pendingLogin = null;
        web.evaluateJavascript("(function f(n){if(window.__appLogin)window.__appLogin(" + t
                + ");else if(n>0)setTimeout(function(){f(n-1)},300)})(40)", null);
    }

    /** Google girişi uygulamanın içinde yapılamıyor; Chrome'da açılır, bitince buraya döner. */
    void openLogin() {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(Config.LOGIN_URL)).addCategory(Intent.CATEGORY_BROWSABLE));
        } catch (Exception ignored) { }
    }

    @Override
    protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (code != FILES || filesCb == null) return;
        Uri[] out = null;
        if (result == RESULT_OK && data != null) {
            if (data.getClipData() != null) {
                out = new Uri[data.getClipData().getItemCount()];
                for (int k = 0; k < out.length; k++) out[k] = data.getClipData().getItemAt(k).getUri();
            } else if (data.getData() != null) {
                out = new Uri[]{data.getData()};
            }
        }
        filesCb.onReceiveValue(out);
        filesCb = null;
    }

    private static String offlinePage() {
        return "<html><body style=\"background:#101513;color:#e6ece8;font-family:sans-serif;text-align:center;padding-top:30vh\">"
                + "<p>İnternet yok. Son ödeme hatırlatmaları yine de telefonun alarmıyla çalar.</p>"
                + "<button style=\"padding:12px 22px;font-size:16px;border-radius:10px;border:0;background:#1e5a48;color:#fff\" "
                + "onclick=\"location.href='" + Config.APP_URL + "'\">Tekrar dene</button></body></html>";
    }

    /** Bildirim izni → kesin alarm izni → pil kısıtlaması, sırayla. user=true ise ayar ekranına da götürür. */
    void fixPermissions(boolean user) {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            boolean asked = Store.p(this).getBoolean("askedNotif", false);
            if (!asked || shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS)) {
                Store.p(this).edit().putBoolean("askedNotif", true).apply();
                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 7);
                return;
            }
        }
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (!nm.areNotificationsEnabled()) {
            if (user) open(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName()));
            return;
        }
        if (!Scheduler.canExact(this) && Build.VERSION.SDK_INT >= 31) {
            open(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + getPackageName())));
            return;
        }
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (!pm.isIgnoringBatteryOptimizations(getPackageName())) {
            boolean asked = Store.p(this).getBoolean("askedBattery", false);
            if (user || !asked) {
                Store.p(this).edit().putBoolean("askedBattery", true).apply();
                open(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                        Uri.parse("package:" + getPackageName())));
            }
        }
    }

    private void open(Intent i) {
        try { startActivity(i); } catch (Exception e) {
            try { startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:" + getPackageName()))); } catch (Exception ignored) { }
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        super.onRequestPermissionsResult(code, perms, res);
        if (code == 7) fixPermissions(false);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        Scheduler.apply(this, false);
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else moveTaskToBack(true);
    }
}
