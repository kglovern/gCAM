package com.petervanderwalt.gcam;

import android.content.Intent;
import android.net.Uri;
import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaPlugin;
import org.json.JSONArray;
import org.json.JSONException;

/** Opens only this app's versioned APK in the system browser. Android confirms installation. */
public class GcamUpdates extends CordovaPlugin {
    @Override public boolean execute(String action, JSONArray args, CallbackContext callback) throws JSONException {
        if (!"open".equals(action)) return false;
        String url = args.getString(0);
        if (!url.matches("https://github\\.com/petervanderwalt/gCAM/releases/download/v[0-9]+\\.[0-9]+\\.[0-9]+/gCAM-[0-9]+\\.[0-9]+\\.[0-9]+-android\\.apk")) {
            callback.error("Invalid update download.");
            return true;
        }
        cordova.getActivity().runOnUiThread(() -> {
            try {
                cordova.getActivity().startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                callback.success();
            } catch (Exception error) { callback.error("Could not open the update download."); }
        });
        return true;
    }
}
