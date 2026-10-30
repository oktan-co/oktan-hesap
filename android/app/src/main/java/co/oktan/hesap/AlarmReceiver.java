package co.oktan.hesap;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Alarm çaldı: önce en güncel planı dener (ekstre bu arada ödenmiş olabilir), sonra bildirimi gösterir. */
public class AlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        final Context c = ctx.getApplicationContext();
        if (intent.getBooleanExtra("test", false)) {
            Notifier.show(c, new Alarm("test", System.currentTimeMillis(), "test",
                    "Oktan Hesap · deneme", "Telefon alarmı çalışıyor. Son ödeme hatırlatmaları dakikasında gelecek.", false));
            return;
        }
        final long ts = intent.getLongExtra("ts", 0);
        final PendingResult pr = goAsync();
        new Thread(() -> {
            try {
                try { Remote.pullPlan(c); } catch (Exception ignored) { /* internet yoksa eldeki plan */ }
                for (Alarm a : Alarm.parse(Store.planJson(c))) {
                    if (a.ts == ts && !Store.fired(c, a.id)) {
                        Notifier.show(c, a);
                        Store.markFired(c, a.id);
                    }
                }
                Scheduler.apply(c, false);
            } finally {
                pr.finish();
            }
        }).start();
    }
}
