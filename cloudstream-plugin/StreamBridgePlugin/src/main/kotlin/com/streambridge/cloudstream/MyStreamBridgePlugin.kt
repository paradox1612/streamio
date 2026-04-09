package com.streambridge.cloudstream

import android.content.Context
import android.content.SharedPreferences
import android.app.AlertDialog
import android.widget.Toast
import com.lagradost.cloudstream3.plugins.CloudstreamPlugin
import com.lagradost.cloudstream3.plugins.Plugin
import android.widget.LinearLayout
import android.widget.EditText
import android.view.inputmethod.EditorInfo
import android.text.InputType

/**
 * MyStreamBridgePlugin — CloudStream plugin entry point.
 *
 * Annotated with @CloudstreamPlugin so the build tool generates manifest.json.
 * Registers the StreamBridgeProvider and wires up the settings dialog where
 * users enter their StreamBridge addon token.
 */
@CloudstreamPlugin
class StreamBridgePlugin : Plugin() {

    private lateinit var appContext: Context

    private fun prefs(context: Context = appContext): SharedPreferences {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    fun getSetting(key: String, defaultValue: String? = null): String? {
        if (!::appContext.isInitialized) return defaultValue
        return prefs().getString(key, defaultValue)
    }

    override fun load(context: Context) {
        appContext = context.applicationContext

        // Register the content provider with CloudStream
        registerMainAPI(StreamBridgeProvider(this))

        // Wire up the settings gear icon in the extension list
        openSettings = { ctx ->
            showSettingsDialog(ctx)
        }
    }

    // ─── Settings Dialog ──────────────────────────────────────────────────────

    /**
     * A simple AlertDialog with two fields:
     *   • Addon Token  – copied from StreamBridge dashboard → "Your Addon URL"
     *   • Backend URL  – optional override for self-hosted installs
     *
     * Values are persisted in SharedPreferences and read by StreamBridgeProvider
     * via getSetting().
     */
    private fun showSettingsDialog(context: Context) {
        val prefs = prefs(context)

        val layout = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            val dp16 = (16 * context.resources.displayMetrics.density).toInt()
            setPadding(dp16, dp16, dp16, dp16)
        }

        // ── Addon Token field ─────────────────────────────────────────────────
        val tokenField = EditText(context).apply {
            hint = "Addon Token (required)"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            imeOptions = EditorInfo.IME_ACTION_NEXT
            setText(prefs.getString("addon_token", ""))
        }

        // ── Backend URL field ─────────────────────────────────────────────────
        val urlField = EditText(context).apply {
            hint = "Backend URL (leave blank for default)"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            imeOptions = EditorInfo.IME_ACTION_DONE
            setText(prefs.getString("base_url", ""))
        }

        layout.addView(tokenField)
        layout.addView(urlField)

        AlertDialog.Builder(context)
            .setTitle("StreamBridge Settings")
            .setMessage(
                "Find your Addon Token in the StreamBridge dashboard under " +
                "\"Your Addon URL\". Only the token portion is needed (the long " +
                "alphanumeric string after /addon/ in the URL)."
            )
            .setView(layout)
            .setPositiveButton("Save") { _, _ ->
                val token = tokenField.text.toString().trim()
                val baseUrl = urlField.text.toString().trim()

                if (token.isEmpty()) {
                    Toast.makeText(context, "Addon token cannot be empty", Toast.LENGTH_SHORT).show()
                    return@setPositiveButton
                }

                prefs.edit()
                    .putString("addon_token", token)
                    .putString("base_url", baseUrl.ifEmpty { null })
                    .apply()

                Toast.makeText(context, "Settings saved! Reload CloudStream to apply.", Toast.LENGTH_LONG).show()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private companion object {
        const val PREFS_NAME = "streambridge_plugin_settings"
    }
}
