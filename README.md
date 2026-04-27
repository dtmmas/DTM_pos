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
