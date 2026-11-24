-keepclassmembers @kotlinx.serialization.Serializable class org.iinicia.app.** {
    *** Companion;
    kotlinx.serialization.KSerializer serializer(...);
}
-keep class net.openid.appauth.** { *; }
