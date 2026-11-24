<#-- Diseño común de los correos IINICIA. Estilos en línea porque los clientes de correo ignoran las hojas de estilo. -->
<#macro emailLayout title="" buttonUrl="" buttonLabel="">
<html lang="${locale.language}">
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#172554;padding:22px 28px;border-bottom:4px solid #0ea5e9;">
          <div style="color:#ffffff;font-size:24px;font-weight:bold;letter-spacing:1px;">IINICIA</div>
          <div style="color:#bae6fd;font-size:13px;margin-top:2px;">Instituto de Innovación y Ciencias Aplicadas</div>
        </td></tr>
        <tr><td style="padding:28px;font-size:15px;line-height:1.6;">
          <#if title?has_content><h1 style="margin:0 0 16px;font-size:21px;color:#172554;">${title}</h1></#if>
          <#nested>
          <#if buttonUrl?has_content>
            <p style="margin:24px 0;">
              <a href="${buttonUrl}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:8px;">${buttonLabel}</a>
            </p>
            <p style="font-size:13px;color:#475569;">${msg("emailLinkFallback")}<br><a href="${buttonUrl}" style="color:#1d4ed8;word-break:break-all;">${buttonUrl}</a></p>
          </#if>
        </td></tr>
        <tr><td style="padding:18px 28px;background:#f8fafc;font-size:12px;color:#64748b;">${msg("emailFooter")}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
</#macro>
