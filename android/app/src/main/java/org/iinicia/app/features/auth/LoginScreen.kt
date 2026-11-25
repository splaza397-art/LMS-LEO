package org.iinicia.app.features.auth

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import org.iinicia.app.R
import org.iinicia.app.ui.theme.Navy

@Composable
fun LoginScreen(error: String?, onLogin: () -> Unit) {
    Surface(color = Navy, modifier = Modifier.fillMaxSize()) {
        Column(
            Modifier.fillMaxSize().systemBarsPadding().verticalScroll(rememberScrollState()).padding(24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Image(
                painter = painterResource(R.drawable.logo_iinicia),
                contentDescription = "IINICIA, Instituto de Innovación y Ciencias Aplicadas",
                modifier = Modifier.size(200.dp),
            )
            Spacer(Modifier.height(16.dp))
            Text("Tu educación comienza hoy, estés donde estés.", color = Color(0xFFBFDBFE), textAlign = TextAlign.Center)
            Spacer(Modifier.height(40.dp))
            Button(
                onClick = onLogin,
                colors = ButtonDefaults.buttonColors(containerColor = Color.White, contentColor = Navy),
                modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
            ) { Text("Iniciar sesión", fontWeight = FontWeight.SemiBold) }
            error?.let {
                Spacer(Modifier.height(16.dp))
                Text(it, color = Color(0xFFFECACA))
            }
        }
    }
}
