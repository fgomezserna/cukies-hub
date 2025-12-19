# Configuración de MongoDB Replica Set para Prisma

## Problema
Prisma requiere que MongoDB esté configurado como replica set para usar transacciones, incluso para operaciones simples como `create()`.

## Solución: Replica Set de Un Solo Nodo (Development)

### Opción 1: Configurar en el Servidor MongoDB

Si tienes acceso al servidor MongoDB (192.168.1.221), puedes configurarlo como replica set:

#### 1. Conéctate al servidor MongoDB
```bash
mongosh "mongodb://admin:changeme123@192.168.1.221:27017/cukies-hub?authSource=admin"
```

#### 2. Inicializa el replica set
```javascript
rs.initiate({
  _id: "rs0",
  members: [
    { _id: 0, host: "192.168.1.221:27017" }
  ]
})
```

#### 3. Verifica el estado
```javascript
rs.status()
```

Deberías ver algo como:
```json
{
  "set": "rs0",
  "myState": 1,
  "members": [...]
}
```

### Opción 2: Usar Docker con Replica Set (Local Development)

Si prefieres usar MongoDB localmente para desarrollo:

```bash
docker run -d \
  --name mongodb-replica-set \
  -p 27017:27017 \
  mongo:latest \
  mongod --replSet rs0

# Inicializar replica set
docker exec -it mongodb-replica-set mongosh --eval "rs.initiate()"
```

### Opción 3: Modificar DATABASE_URL (Temporal)

Si no puedes modificar el servidor MongoDB, puedes intentar agregar parámetros a la conexión (aunque esto no siempre funciona):

```env
DATABASE_URL="mongodb://admin:changeme123@192.168.1.221:27017/cukies-hub?authSource=admin&replicaSet=rs0"
```

**Nota**: Esto solo funciona si el servidor ya está configurado como replica set.

## Verificación

Después de configurar el replica set, prueba crear una sesión de juego nuevamente. El error debería desaparecer.

## Referencias

- [Prisma MongoDB Transactions](https://www.prisma.io/docs/concepts/components/prisma-client/transactions)
- [MongoDB Replica Set Setup](https://www.mongodb.com/docs/manual/replication/)

