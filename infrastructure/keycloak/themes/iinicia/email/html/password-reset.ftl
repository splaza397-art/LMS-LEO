<#import "template.ftl" as layout>
<@layout.emailLayout title=msg("passwordResetTitle") buttonUrl=link buttonLabel=msg("passwordResetButton")>
<p style="margin:0 0 12px;">${msg("passwordResetIntro")}</p>
<p style="margin:0;">${msg("emailVerificationExpires", linkExpirationFormatter(linkExpiration))}</p>
<p style="margin:12px 0 0;color:#475569;">${msg("passwordResetIgnore")}</p>
</@layout.emailLayout>
