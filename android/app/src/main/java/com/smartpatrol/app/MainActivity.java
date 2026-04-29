/*
Tujuan: Entry activity Android SmartPatrol, payload launch push, dan registrasi plugin native aplikasi.
Caller: Android launcher dan Capacitor runtime.
Dependensi: BridgeActivity Capacitor, SmartPatrolTimePlugin, dan intent push SOS.
Main Functions: Memulai WebView Capacitor, menyimpan intent terbaru, serta mendaftarkan plugin waktu/native launch payload.
Side Effects: Membuat bridge native yang dapat dipanggil dari JavaScript dan memperbarui intent saat notifikasi membuka app.
*/
package com.smartpatrol.app;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SmartPatrolTimePlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
    }
}
