# Correccion SSL VPS Certbot Spec

## Why
La emision de certificados SSL para `farmesperanza.com` y `farmaciamisangelitos.com` fallo y no existen rutas en `/etc/letsencrypt/live/...`. Se necesita un procedimiento claro y verificable para emitir certificados y dejar Nginx sirviendo ambas apps por HTTPS sin romper los procesos actuales en PM2.

## What Changes
- Documentar el flujo correcto para emitir certificados usando `certbot certonly --webroot` en lugar de `certbot --nginx`.
- Definir la configuracion requerida de Nginx para `/.well-known/acme-challenge/` y para los bloques HTTP/HTTPS de ambos dominios.
- Definir la distribucion final de puertos de backend para evitar conflictos con procesos ya existentes.
- Establecer verificaciones previas y posteriores a la emision del certificado.
- Marcar como reemplazado el intento anterior basado en `certbot --nginx` para este VPS.

## Impact
- Affected specs: despliegue VPS, SSL, Nginx, PM2, DNS operativo
- Affected code: `.trae/specs/fix-vps-ssl-certbot/spec.md`, `.trae/specs/fix-vps-ssl-certbot/tasks.md`, `.trae/specs/fix-vps-ssl-certbot/checklist.md`

## ADDED Requirements
### Requirement: Emision SSL por Webroot
El sistema de despliegue SHALL emitir certificados Let's Encrypt para ambos dominios usando el modo `webroot` con una carpeta compartida para `/.well-known/acme-challenge/`.

#### Scenario: Emision exitosa de certificados
- **WHEN** el operador ejecuta `certbot certonly --webroot -w /var/www/_letsencrypt` para un dominio y su `www`
- **THEN** Certbot genera certificados validos en `/etc/letsencrypt/live/<dominio>/`
- **AND** el operador puede listar `fullchain.pem` y `privkey.pem` para cada dominio

### Requirement: Validacion HTTP previa a SSL
El despliegue SHALL verificar que los cuatro hostnames (`farmesperanza.com`, `www.farmesperanza.com`, `farmaciamisangelitos.com`, `www.farmaciamisangelitos.com`) respondan un archivo de prueba en `/.well-known/acme-challenge/` antes de emitir certificados.

#### Scenario: Validacion previa correcta
- **WHEN** el operador consulta `http://<dominio>/.well-known/acme-challenge/test.txt`
- **THEN** la respuesta es `ok`
- **AND** no se recibe HTML de la app, pagina de parking ni error `500`

### Requirement: Separacion de puertos por instancia
El despliegue SHALL mantener cada backend en un puerto exclusivo para evitar choques entre proyectos del mismo VPS.

#### Scenario: Distribucion operativa
- **WHEN** el operador revisa puertos escuchando
- **THEN** `dtmpos-api` permanece en `4003`
- **AND** `farmangelitos-api` usa `4004`
- **AND** `farmesperanza-api` usa `4005`

### Requirement: Nginx con bloques HTTP y HTTPS
Cada dominio SHALL tener un bloque HTTP para challenge y redireccion a HTTPS, y un bloque HTTPS con certificado valido, SPA fallback y proxy a `/api` y `/uploads`.

#### Scenario: Sitio sirviendo por HTTPS
- **WHEN** el operador abre `https://farmesperanza.com` o `https://farmaciamisangelitos.com`
- **THEN** Nginx sirve el frontend compilado
- **AND** `/api` y `/uploads` proxyean al puerto correcto del backend

## MODIFIED Requirements
### Requirement: Procedimiento de generacion de SSL
El procedimiento de SSL para este VPS ya no debe depender del plugin `--nginx` de Certbot cuando la validacion ACME devuelve `500` durante la configuracion temporal. El flujo oficial debe usar `certbot certonly --webroot`, validacion previa por `curl`, y configuracion manual de Nginx con certificados emitidos.

## REMOVED Requirements
### Requirement: Emision SSL automatica con Certbot Nginx Plugin
**Reason**: En este VPS el plugin `--nginx` introduce validaciones temporales que estan devolviendo `500` aun cuando el challenge fijo por `webroot` responde correctamente.
**Migration**: Sustituir el uso de `certbot --nginx` por `certbot certonly --webroot` y despues cargar manualmente los certificados en Nginx.
