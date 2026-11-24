<#import "template.ftl" as layout>
<@layout.emailLayout title=msg("emailVerificationTitle") buttonUrl=link buttonLabel=msg("emailVerificationButton")>
<p style="margin:0 0 12px;">${msg("emailVerificationIntro")}</p>
<p style="margin:0;">${msg("emailVerificationExpires", linkExpirationFormatter(linkExpiration))}</p>
<p style="margin:12px 0 0;color:#475569;">${msg("emailVerificationIgnore")}</p>
</@layout.emailLayout>
