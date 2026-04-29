/*
Tujuan: Menangani payload FCM SOS agar Android menampilkan full-screen alert dengan sound.
Caller: Firebase Cloud Messaging ketika data push diterima perangkat Android.
Dependensi: Capacitor Push Notifications MessagingService, Android Notification API, dan MainActivity.
Main Functions: Meneruskan payload ke plugin Capacitor, membuat channel SOS, dan memunculkan full-screen notification.
Side Effects: Menampilkan notifikasi darurat bersuara dan membuka MainActivity melalui full-screen intent sesuai kebijakan Android.
*/
package com.smartpatrol.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;

import org.json.JSONObject;

import java.util.Map;

public class SmartPatrolMessagingService extends MessagingService {
    private static final String SOS_CHANNEL_ID = "smartpatrol-sos";
    private static final String PUSH_PAYLOAD_EXTRA = "smartpatrol_push_payload";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);

        Map<String, String> data = remoteMessage.getData();
        if (!"sos".equals(data.get("type"))) {
            return;
        }

        showSosFullScreenNotification(data);
    }

    private void showSosFullScreenNotification(Map<String, String> data) {
        createSosChannel();

        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return;
        }

        Intent launchIntent = new Intent(this, MainActivity.class);
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        launchIntent.putExtra(PUSH_PAYLOAD_EXTRA, new JSONObject(data).toString());

        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            1001,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        String title = safeValue(data.get("title"), "DARURAT SOS");
        String body = safeValue(data.get("body"), safeValue(data.get("message"), "SOS SmartPatrol diterima."));
        Uri alarmSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, SOS_CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setSound(alarmSound)
            .setVibrate(new long[] { 0, 800, 300, 800, 300, 1200 })
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setFullScreenIntent(pendingIntent, true);

        NotificationManagerCompat.from(this).notify(1001, builder.build());
    }

    private void createSosChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationChannel channel = new NotificationChannel(
            SOS_CHANNEL_ID,
            "SmartPatrol SOS",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Peringatan darurat SOS SmartPatrol.");
        channel.enableVibration(true);
        channel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);

        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.createNotificationChannel(channel);
        }
    }

    private String safeValue(String value, String fallback) {
        if (value == null || value.trim().isEmpty()) {
            return fallback;
        }
        return value.trim();
    }
}
