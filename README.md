# DTMPos

Sistema POS e inventario con frontend en React + Vite y backend en Node.js + Express + MySQL.

## Stack

- Frontend: React, TypeScript, Vite, Zustand, React Router
- Backend: Node.js, Express, MySQL, JWT
- Extras: subida de documentos, control de caja, POS standalone, reportes e inventario por almacen

## Estructura

```text
DTMPos/
|-- client/   # Aplicacion web
|-- server/   # API y logica de negocio
|-- db/       # Script base de esquema MySQL
```

## Requisitos

- Node.js 18 o superior
- MySQL 8 o compatible
- npm

## Instalacion

### 1. Clonar el repositorio

```bash
git clone https://github.com/dtmmas/DTM_pos.git
cd DTM_pos
```

### 2. Instalar dependencias

```bash
cd client
npm install
cd ../server
npm install
```

### 3. Crear base de datos

Usa el archivo `db/schema.sql` para crear la base de datos inicial.

### 4. Configurar variables de entorno

Copia `server/.env.example` a `server/.env` y ajusta los valores:

```env
PORT=4000
JWT_SECRET=supersecretjwt
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=dtmpos
```

## Ejecucion

### Backend

```bash
cd server
npm run dev
```

### Frontend

```bash
cd client
npm run dev
```

## Produccion

- Frontend compilado en `client/dist`
- Backend Node.js servido por PM2 en `server/server.js`
- Nginx recomendado para exponer `client/dist` y hacer proxy de `/api` y `/uploads`
- `client/src/api.ts` ya usa `baseURL: '/api'`, por lo que el despliegue productivo debe mantener frontend y API bajo el mismo dominio

### Variables de entorno del servidor

Archivo base: `server/.env.example`

Variables importantes:

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=4003
TRUST_PROXY=1
CORS_ORIGIN=https://tu-dominio.com,https://www.tu-dominio.com
JWT_SECRET=cambia_esto
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=tu_usuario
DB_PASSWORD=tu_password
DB_NAME=dtmpos
```

### Build local de produccion

```bash
cd client
npm install
npm run build

cd ../server
npm install
npm run start
```

## Despliegue Hostinger VPS

Archivos incluidos:

- `deploy/hostinger/nginx.conf.example`
- `deploy/hostinger/server.env.example`
- `server/ecosystem.config.cjs`

### 1. Preparar VPS

Instala dependencias base:

```bash
sudo apt update
sudo apt install -y nginx mysql-server
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

### 2. Clonar proyecto

```bash
cd /var/www
sudo git clone https://github.com/dtmmas/DTM_pos.git dtmpos
sudo chown -R $USER:$USER /var/www/dtmpos
cd /var/www/dtmpos
```

### 3. Instalar dependencias y compilar frontend

```bash
cd /var/www/dtmpos/client
npm install
npm run build

cd /var/www/dtmpos/server
npm install
```

### 4. Configurar backend

```bash
cd /var/www/dtmpos/server
cp .env.example .env
```

Edita `server/.env` con tus credenciales reales de MySQL y tu dominio final.

### 5. Base de datos

- Crea la base `dtmpos`
- Importa `db/schema.sql`
- Ejecuta migraciones necesarias:

```bash
cd /var/www/dtmpos/server
npm run migrate
```

### 6. Levantar API con PM2

```bash
cd /var/www/dtmpos
pm2 start server/ecosystem.config.cjs
pm2 save
pm2 startup
```

Prueba la API:

```bash
curl http://127.0.0.1:4003/api/health
```

### 7. Configurar Nginx

1. Copia `deploy/hostinger/nginx.conf.example`
2. Reemplaza `your-domain.com` por tu dominio
3. Ajusta `root /var/www/dtmpos/client/dist;`

Ejemplo:

```bash
sudo nano /etc/nginx/sites-available/dtmpos
sudo ln -s /etc/nginx/sites-available/dtmpos /etc/nginx/sites-enabled/dtmpos
sudo nginx -t
sudo systemctl reload nginx
```

### 8. SSL con Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d tu-dominio.com -d www.tu-dominio.com
```

### 9. Actualizar proyecto en produccion

```bash
cd /var/www/dtmpos
git pull origin main

cd client
npm install
npm run build

cd ../server
npm install
pm2 restart dtmpos-api
```

### 10. Directorios persistentes

- `server/uploads` debe conservarse entre actualizaciones
- `server/.env` no debe subirse al repositorio
- Si automatizas deploy, respalda `server/uploads` antes de cambios mayores

## Scripts utiles

### Client

```bash
npm run dev
npm run build
npm run preview
```

### Server

```bash
npm run dev
npm run migrate
npm run seed
npm run seed:shelves
```

## Funcionalidades principales

- Dashboard y modulos administrativos
- Gestion de productos, marcas, categorias, departamentos y almacenes
- Compras y ventas
- POS en ventana independiente
- Ventas en espera
- Control de caja con aperturas, movimientos y cierres
- Reportes de inventario y credito
- Control de stock por almacen
- Soporte para productos generales, medicinales, IMEI y serial

## Notas

- El backend usa MySQL de forma obligatoria.
- `node_modules`, builds, `.env` y archivos de subida quedan ignorados por Git.
- Si publicas este proyecto, revisa siempre que `server/.env` no se suba al repositorio.

## Repositorio

- GitHub: [https://github.com/dtmmas/DTM_pos](https://github.com/dtmmas/DTM_pos)
