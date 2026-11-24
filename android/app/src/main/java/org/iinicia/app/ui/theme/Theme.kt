package org.iinicia.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val Navy = Color(0xFF172554)
val Blue = Color(0xFF1D4ED8)

private val colors = lightColorScheme(
    primary = Blue,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFDBEAFE),
    onPrimaryContainer = Navy,
    secondary = Color(0xFF475569),
    background = Color(0xFFF8FAFC),
    onBackground = Color(0xFF0F172A),
    surface = Color.White,
    onSurface = Color(0xFF0F172A),
    onSurfaceVariant = Color(0xFF475569),
    error = Color(0xFFB91C1C),
)

@Composable
fun IiniciaTheme(content: @Composable () -> Unit) = MaterialTheme(colorScheme = colors, content = content)
