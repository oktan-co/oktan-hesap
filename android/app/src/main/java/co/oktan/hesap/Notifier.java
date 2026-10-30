package co.oktan.hesap;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;

/** Bildirimleri gösterir. İki kanal: öğlen hatırlatmaları ve son gün akşam hatırlatmaları. */
final class Notifier {
    private Notifier() {}
    static final String CH_NORMAL = "odeme";
    static final String CH_URGENT = "sonGun";

    static void channels(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        NotificationChannel a = new NotificationChannel(CH_NORMAL, "Hatırlatmalar", NotificationManager.IMPORTANCE_HIGH);
        a.setDescription("Son ödemeden bir gün önce ve son gün öğlen");
        a.enableVibration(true);
        a.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        NotificationChannel b = new NotificationChannel(CH_URGENT, "Son gün akşam hatırlatmaları", NotificationManager.IMPORTANCE_HIGH);
        b.setDescription("Son gün ödenmemiş ekstre için akşam tekrarları");
        b.enableVibration(true);
        b.setVibrationPattern(new long[]{0, 500, 250, 500, 250, 500});
        b.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(a);
        nm.createNotificationChannel(b);
    }

    static void show(Context c, Alarm a) {
        channels(c);
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        Intent open = new Intent(c, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, a.id.hashCode(), open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String first = a.body == null ? "" : a.body.split("\n", 2)[0];
        Notification n = new Notification.Builder(c, a.urgent ? CH_URGENT : CH_NORMAL)
                .setSmallIcon(R.drawable.ic_stat)
                .setColor(0xFF1E5A48)
                .setContentTitle(a.title)
                .setContentText(first)
                .setStyle(new Notification.BigTextStyle().bigText(a.body))
                .setContentIntent(pi)
                .setAutoCancel(true)
                .setCategory(Notification.CATEGORY_REMINDER)
                .setShowWhen(true)
                .setWhen(a.ts > 0 ? a.ts : System.currentTimeMillis())
                .build();
        // Yeni ödeme hatırlatması bir öncekinin yerine geçer (bildirim çubuğu dolmasın)
        int id = "test".equals(a.kind) ? 1000 : 2001;
        nm.notify(id, n);
    }
}
