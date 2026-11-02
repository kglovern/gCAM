package com.petervanderwalt.gcam;

import android.app.Activity;
import android.content.Intent;
import android.util.Base64;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaPlugin;
import org.json.JSONArray;
import org.json.JSONException;

/** Uses Android's document picker; no storage permission or shared filesystem access. */
public class GcamFiles extends CordovaPlugin {
    private static final int SAVE = 701;
    private CallbackContext pending;
    private byte[] content;

    @Override public boolean execute(String action, JSONArray args, CallbackContext callback) throws JSONException {
        if (!"save".equals(action) && !"saveBinary".equals(action)) return false;
        if (pending != null) { callback.error("Another export is still open."); return true; }
        final String name = args.getString(0);
        final String mime = args.getString(2);
        try {
            content = "saveBinary".equals(action)
                ? Base64.decode(args.getString(1), Base64.NO_WRAP)
                : args.getString(1).getBytes(StandardCharsets.UTF_8);
        } catch (IllegalArgumentException error) { callback.error("Invalid binary export data."); return true; }
        pending = callback;
        cordova.getActivity().runOnUiThread(() -> {
            try {
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType(mime);
                intent.putExtra(Intent.EXTRA_TITLE, name);
                cordova.startActivityForResult(this, intent, SAVE);
            } catch (Exception error) { finish(error.getMessage()); }
        });
        return true;
    }

    @Override public void onActivityResult(int request, int result, Intent data) {
        if (request != SAVE || pending == null) return;
        if (result != Activity.RESULT_OK || data == null || data.getData() == null) { finish("CANCELLED"); return; }
        final CallbackContext callback = pending;
        final byte[] bytes = content;
        pending = null;
        content = null;
        cordova.getThreadPool().execute(() -> {
            try (OutputStream output = cordova.getActivity().getContentResolver().openOutputStream(data.getData(), "wt")) {
                if (output == null) throw new IllegalStateException("Could not open the chosen file.");
                output.write(bytes);
                callback.success();
            } catch (Exception error) { callback.error(error.getMessage()); }
        });
    }

    private void finish(String error) {
        if (pending != null) pending.error(error == null ? "Export failed." : error);
        pending = null;
        content = null;
    }
    @Override public void onReset() { finish("CANCELLED"); }
}
