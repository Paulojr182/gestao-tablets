package com.school.tabletcontrol

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import kotlinx.coroutines.*
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okhttp3.Response

class MainActivity : AppCompatActivity() {

    private lateinit var etServerIp: EditText
    private lateinit var btnTestConnection: Button
    private lateinit var etStudentEnrollment: EditText
    private lateinit var etStudentPassword: EditText
    private lateinit var btnLogin: Button
    private lateinit var layoutConfig: LinearLayout
    private lateinit var layoutLogin: LinearLayout
    private lateinit var layoutActiveSession: LinearLayout
    private lateinit var tvSessionGreeting: TextView
    private lateinit var btnLogout: Button
    private lateinit var tvStatusText: TextView

    private lateinit var sharedPreferences: SharedPreferences
    private var tabletSerialNumber = ""
    private var tabletName = ""
    private var isKioskModeActive = false
    private var isBlocked = false

    private val activityScope = CoroutineScope(Dispatchers.Main + Job())
    private var heartbeatJob: Job? = null
    
    private var webSocket: WebSocket? = null
    private val client = OkHttpClient()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Hide Action Bar and Full Screen status bar
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setFullScreen()

        setContentView(getLayoutResourceView())

        sharedPreferences = getSharedPreferences("TabletConfig", Context.MODE_PRIVATE)
        tabletSerialNumber = Build.SERIAL.ifBlank { Build.MODEL + "_" + Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID) }
        tabletName = "Tablet " + Build.MODEL

        initViews()
        loadConfiguration()
        startWebSocketConnection()
        startHeartbeatLoop()
        
        handleIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        if (intent != null && intent.getBooleanExtra("ACTION_LOGOUT", false)) {
            // Trigger student session logout when notification is tapped
            handleStudentLogout()
        }
    }

    private fun setFullScreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false)
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            )
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            setFullScreen()
        }
    }

    // Dynamic views layout creation programmatically to guarantee compilation without external layout XML dependency
    private fun getLayoutResourceView(): View {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(40, 40, 40, 40)
            gravity = android.view.Gravity.CENTER
            setBackgroundColor(0xFF0F172A.toInt()) // Sleek slate color matched from web
        }

        val title = TextView(this).apply {
            text = "Controle de Tablets Escolares"
            textSize = 24f
            setTextColor(0xFFFFFFFF.toInt())
            gravity = android.view.Gravity.CENTER
            setPadding(0, 0, 0, 40)
        }
        root.addView(title)

        tvStatusText = TextView(this).apply {
            text = "Status: Conectando..."
            textSize = 14f
            setTextColor(0xFF94A3B8.toInt())
            gravity = android.view.Gravity.CENTER
            setPadding(0, 0, 0, 30)
        }
        root.addView(tvStatusText)

        // Config Section (IP definition)
        layoutConfig = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = android.view.Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        }
        etServerIp = EditText(this).apply {
            hint = "Endereço do Servidor (ex: gestaotabletscscjf.gestaohub.com)"
            setTextColor(0xFFFFFFFF.toInt())
            setHintTextColor(0xFF64748B.toInt())
            setText("https://gestaotabletscscjf.gestaohub.com")
        }
        btnTestConnection = Button(this).apply {
            text = "Testar Conexão"
        }
        layoutConfig.addView(etServerIp)
        layoutConfig.addView(btnTestConnection)
        root.addView(layoutConfig)

        // Login Section
        layoutLogin = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            visibility = View.GONE
            gravity = android.view.Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        }
        etStudentEnrollment = EditText(this).apply {
            hint = "Matrícula do Estudante"
            setTextColor(0xFFFFFFFF.toInt())
            setHintTextColor(0xFF64748B.toInt())
        }
        etStudentPassword = EditText(this).apply {
            hint = "Senha (ou admin1234 para bypass)"
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD
            setTextColor(0xFFFFFFFF.toInt())
            setHintTextColor(0xFF64748B.toInt())
        }
        btnLogin = Button(this).apply {
            text = "Fazer Login"
        }
        layoutLogin.addView(etStudentEnrollment)
        layoutLogin.addView(etStudentPassword)
        layoutLogin.addView(btnLogin)
        root.addView(layoutLogin)

        // Active Session Layout
        layoutActiveSession = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            visibility = View.GONE
            gravity = android.view.Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        }
        tvSessionGreeting = TextView(this).apply {
            text = "Olá Estudante!"
            textSize = 20f
            setTextColor(0xFF10B981.toInt())
            setPadding(0, 0, 0, 20)
        }
        btnLogout = Button(this).apply {
            text = "Encerrar Sessão (Logout)"
        }
        layoutActiveSession.addView(tvSessionGreeting)
        layoutActiveSession.addView(btnLogout)
        root.addView(layoutActiveSession)

        return root
    }

    private fun initViews() {
        btnTestConnection.setOnClickListener { testConnection() }
        btnLogin.setOnClickListener { handleStudentLogin() }
        btnLogout.setOnClickListener { handleStudentLogout() }
    }

    private fun loadConfiguration() {
        val savedIp = sharedPreferences.getString("serverIp", "")
        if (!savedIp.isNullOrBlank()) {
            etServerIp.setText(savedIp)
        }
    }

    private fun getServerUrl(): String {
        var ip = etServerIp.text.toString().trim()
        if (!ip.startsWith("http://") && !ip.startsWith("https://")) {
            ip = "http://$ip"
        }
        return ip
    }

    private fun startHeartbeatLoop() {
        heartbeatJob?.cancel()
        heartbeatJob = activityScope.launch {
            while (isActive) {
                delay(12000) // 12 seconds
                sendHeartbeat()
            }
        }
    }

    private fun startWebSocketConnection() {
        try {
            val serverUrl = getServerUrl()
            val wsUrl = serverUrl.replace("http://", "ws://").replace("https://", "wss://")
            val request = Request.Builder().url(wsUrl).build()
            
            webSocket = client.newWebSocket(request, object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    val connPayload = JSONObject().apply {
                        put("type", "tablet_connect")
                        put("serialNumber", tabletSerialNumber)
                    }
                    webSocket.send(connPayload.toString())
                    runOnUiThread {
                        tvStatusText.text = "Status: Conectado ao Servidor"
                        tvStatusText.setTextColor(0xFF10B981.toInt())
                    }
                }

                override fun onMessage(webSocket: WebSocket, text: String) {
                    try {
                        val obj = JSONObject(text)
                        if (obj.getString("type") == "remote_action") {
                            val action = obj.getString("action")
                            val serial = obj.optString("serialNumber")
                            
                            if (serial == tabletSerialNumber) {
                                runOnUiThread {
                                    handleRemoteAction(action)
                                }
                            }
                        }
                    } catch (e: Exception) {
                        e.printStackTrace()
                    }
                }

                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                    runOnUiThread {
                        tvStatusText.text = "Status: Desconectado"
                        tvStatusText.setTextColor(0xFFEF4444.toInt())
                    }
                }

                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    runOnUiThread {
                        tvStatusText.text = "Status: Erro de Conexão"
                        tvStatusText.setTextColor(0xFFEF4444.toInt())
                    }
                }
            })
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun handleRemoteAction(action: String) {
        when (action) {
            "block" -> {
                isBlocked = true
                layoutLogin.visibility = View.GONE
                layoutActiveSession.visibility = View.GONE
                tvStatusText.text = "Tablet Bloqueado Administrativamente"
                tvStatusText.setTextColor(0xFFF59E0B.toInt())
                startLockScreenKiosk()
            }
            "unblock" -> {
                isBlocked = false
                tvStatusText.text = "Tablet Desbloqueado. Aguardando Login"
                tvStatusText.setTextColor(0xFFFFFFFF.toInt())
                layoutLogin.visibility = View.VISIBLE
            }
            "logout" -> {
                performLocalLogout()
            }
        }
    }

    private fun testConnection() {
        val serverUrl = getServerUrl()
        activityScope.launch(Dispatchers.IO) {
            try {
                val url = URL("$serverUrl/api/tablet/register-or-ping")
                val connection = url.openConnection() as HttpURLConnection
                connection.requestMethod = "POST"
                connection.connectTimeout = 4000
                connection.readTimeout = 4000
                connection.setRequestProperty("Content-Type", "application/json")
                connection.doOutput = true

                val payload = JSONObject().apply {
                    put("serialNumber", tabletSerialNumber)
                    put("name", tabletName)
                }

                val wr = OutputStreamWriter(connection.outputStream)
                wr.write(payload.toString())
                wr.flush()

                val code = connection.responseCode
                if (code == 200) {
                    // Save correct IP
                    sharedPreferences.edit().putString("serverIp", serverUrl).apply()
                    startWebSocketConnection()
                    
                    withContext(Dispatchers.Main) {
                        Toast.makeText(this@MainActivity, "Conexão estabelecida com sucesso!", Toast.LENGTH_SHORT).show()
                        layoutConfig.visibility = View.GONE
                        layoutLogin.visibility = View.VISIBLE
                        tvStatusText.text = "Status: Pronto para Login"
                    }
                } else {
                    withContext(Dispatchers.Main) {
                        Toast.makeText(this@MainActivity, "Servidor retornou erro: $code", Toast.LENGTH_LONG).show()
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    Toast.makeText(this@MainActivity, "Falha na conexão: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    private fun handleStudentLogin() {
        if (isBlocked) {
            Toast.makeText(this, "Este tablet está bloqueado!", Toast.LENGTH_SHORT).show()
            return
        }
        val enrollment = etStudentEnrollment.text.toString().trim()
        val password = etStudentPassword.text.toString().trim()
        if (enrollment.isEmpty()) {
            Toast.makeText(this, "Informe o número de matrícula", Toast.LENGTH_SHORT).show()
            return
        }

        val serverUrl = getServerUrl()
        activityScope.launch(Dispatchers.IO) {
            try {
                val url = URL("$serverUrl/api/tablet/login")
                val connection = url.openConnection() as HttpURLConnection
                connection.requestMethod = "POST"
                connection.setRequestProperty("Content-Type", "application/json")
                connection.doOutput = true

                val payload = JSONObject().apply {
                    put("serialNumber", tabletSerialNumber)
                    put("enrollmentId", enrollment)
                    put("password", password)
                }

                val wr = OutputStreamWriter(connection.outputStream)
                wr.write(payload.toString())
                wr.flush()

                if (connection.responseCode == 200) {
                    val resText = connection.inputStream.bufferedReader().readText()
                    val responseObj = JSONObject(resText)
                    val studentName = responseObj.getString("studentName")

                    withContext(Dispatchers.Main) {
                        Toast.makeText(this@MainActivity, "Bem vindo, $studentName!", Toast.LENGTH_SHORT).show()
                        
                        // Show persistent active session notification in status bar
                        showSessionNotification(studentName)

                        layoutLogin.visibility = View.GONE
                        layoutActiveSession.visibility = View.VISIBLE
                        tvSessionGreeting.text = "Estudante logado:\n$studentName"
                        
                        // Disable Kiosk restrictions temporarily to let student use external browser or apps
                        stopLockScreenKiosk()
                    }
                } else {
                    val errText = connection.errorStream.bufferedReader().readText()
                    val errObj = JSONObject(errText)
                    val errorMsg = errObj.optString("error", "Erro de autenticação")
                    withContext(Dispatchers.Main) {
                        Toast.makeText(this@MainActivity, errorMsg, Toast.LENGTH_LONG).show()
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    Toast.makeText(this@MainActivity, "Falha de comunicação: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    private fun showSessionNotification(studentName: String) {
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
        val channelId = "student_session_channel"
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = android.app.NotificationChannel(
                channelId,
                "Sessão do Estudante",
                android.app.NotificationManager.IMPORTANCE_DEFAULT
            )
            notificationManager.createNotificationChannel(channel)
        }

        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("ACTION_LOGOUT", true)
        }
        
        val pendingIntent = android.app.PendingIntent.getActivity(
            this,
            0,
            intent,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
            } else {
                android.app.PendingIntent.FLAG_UPDATE_CURRENT
            }
        )

        val notification = androidx.core.app.NotificationCompat.Builder(this, channelId)
            .setContentTitle("Sessão Ativa")
            .setContentText("Logado como: $studentName. Toque para sair.")
            .setSmallIcon(android.R.drawable.ic_menu_info_details)
            .setOngoing(true) // Prevent swipe-to-delete
            .setContentIntent(pendingIntent)
            .build()

        notificationManager.notify(999, notification)
    }

    private fun handleStudentLogout() {
        val serverUrl = getServerUrl()
        activityScope.launch(Dispatchers.IO) {
            try {
                val url = URL("$serverUrl/api/tablet/logout")
                val connection = url.openConnection() as HttpURLConnection
                connection.requestMethod = "POST"
                connection.setRequestProperty("Content-Type", "application/json")
                connection.doOutput = true

                val payload = JSONObject().apply {
                    put("serialNumber", tabletSerialNumber)
                }

                val wr = OutputStreamWriter(connection.outputStream)
                wr.write(payload.toString())
                wr.flush()

                if (connection.responseCode == 200) {
                    withContext(Dispatchers.Main) {
                        performLocalLogout()
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    private fun performLocalLogout() {
        etStudentEnrollment.text.clear()
        etStudentPassword.text.clear()
        layoutActiveSession.visibility = View.GONE
        layoutLogin.visibility = View.VISIBLE
        
        // 1. Clear session and notification
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
        notificationManager.cancel(999)
        clearTabletSessionCache()

        // 2. Kill browsers and other client apps using DeviceOwner privileges to secure session wipe
        killAllBrowsersAndWorkApps()
        
        // Lock screen kiosk mode reactivation
        startLockScreenKiosk()
        Toast.makeText(this, "Sessão encerrada e dados limpos.", Toast.LENGTH_SHORT).show()
    }

    private fun killAllBrowsersAndWorkApps() {
        try {
            val activityManager = getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
            // Force-stop all web browsers to clear session and prevent credentials theft
            val browsers = arrayOf(
                "com.android.chrome",
                "com.sec.android.app.sbrowser",
                "org.mozilla.firefox",
                "com.microsoft.emmx",
                "com.opera.browser"
            )
            for (pkg in browsers) {
                try {
                    // Kills all active tasks of this app package instantly
                    activityManager.killBackgroundProcesses(pkg)
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun clearTabletSessionCache() {
        // 1. Clear SharedPreferences session keys
        sharedPreferences.edit().remove("studentSessionToken").apply()

        // 2. Clear application webview cookies and storage (e.g. browser platforms cache inside the kiosk WebView if any)
        try {
            android.webkit.CookieManager.getInstance().removeAllCookies(null)
            android.webkit.WebStorage.getInstance().deleteAllData()
        } catch (e: Exception) {
            e.printStackTrace()
        }

        // Android sandbox limit comments regarding third party apps:
        // * Under Android security sandbox, an application CANNOT directly clear data/cache or log out of third-party
        //   apps (like Microsoft Teams, Chrome, Google Classroom) because each app has isolated user space and keys.
        // * To achieve full third-party cleanup, the school tablets should run with Android Management API or
        //   Android Enterprise, using a Device Owner app to wipe the profile or reset runtime guest states.
    }

    private fun sendHeartbeat() {
        val serverIp = getServerUrl()
        if (serverIp.isBlank()) return
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val url = URL("$serverIp/api/tablet/heartbeat")
                val connection = url.openConnection() as HttpURLConnection
                connection.requestMethod = "POST"
                connection.connectTimeout = 3000
                connection.setRequestProperty("Content-Type", "application/json")
                connection.doOutput = true

                val payload = JSONObject().apply {
                    put("serialNumber", tabletSerialNumber)
                }

                val wr = OutputStreamWriter(connection.outputStream)
                wr.write(payload.toString())
                wr.flush()
                connection.responseCode // execute
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    private fun startLockScreenKiosk() {
        isKioskModeActive = true
        // If we are set as Device Owner, start Lock Task Mode
        val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val adminName = ComponentName(this, BootReceiver::class.java)
        if (dpm.isDeviceOwnerApp(packageName)) {
            dpm.setLockTaskPackages(adminName, arrayOf(packageName))
            startLockTask()
        }
    }

    private fun stopLockScreenKiosk() {
        isKioskModeActive = false
        val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        if (dpm.isDeviceOwnerApp(packageName)) {
            try {
                stopLockTask()
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    // Intercept back button and volume controls to lock navigation when kiosk mode is on
    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (isKioskModeActive) {
            if (keyCode == KeyEvent.KEYCODE_BACK || keyCode == KeyEvent.KEYCODE_HOME) {
                return true // Consume key press
            }
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onDestroy() {
        super.onDestroy()
        heartbeatJob?.cancel()
        webSocket?.close(1000, "Activity destroyed")
    }
}
