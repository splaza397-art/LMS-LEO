<#outputformat "plainText">
<#assign requiredActionsText><#if requiredActions??><#list requiredActions><#items as reqActionItem>${msg("requiredAction.${reqActionItem}")}<#sep>, </#sep></#items></#list></#if></#assign>
</#outputformat>
<#import "template.ftl" as layout>
<@layout.emailLayout title=msg("executeActionsTitle") buttonUrl=link buttonLabel=msg("executeActionsButton")>
<p style="margin:0 0 12px;">${msg("executeActionsIntro", requiredActionsText)}</p>
<p style="margin:0;">${msg("emailVerificationExpires", linkExpirationFormatter(linkExpiration))}</p>
<p style="margin:12px 0 0;color:#475569;">${msg("executeActionsIgnore")}</p>
</@layout.emailLayout>
