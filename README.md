# Control Batch · Validador de Lote

Aplicación web para validar lotes batch en sistemas de procesamiento por lotes. Implementa controles de auditoría informática para la recepción y validación independiente de archivos batch.

## 📋 Descripción

**Control Batch** actúa como un **sistema receptor** de lotes batch. La aplicación:

- ✅ Valida el formato del archivo `.txt` cargado
- 🔢 Recalcula totales de forma independiente
- 📊 Compara los totales recalculados contra los declarados en la cabecera
- 🎯 Acepta o rechaza el lote según los controles implementados

## 🚀 Características

### Validaciones implementadas

1. **Nombre del archivo**: Verifica que siga el patrón `T[4 dígitos]B[1-4][8 dígitos].txt`
2. **Cabecera**: Valida institución, fecha, número de filas y total declarado
3. **Estructura**: Detecta líneas vacías y errores de formato
4. **Separadores**: Verifica uso correcto de tabuladores
5. **Totales**: Recalcula y compara montos contra la cabecera
6. **Subtotales**: Desglose por grupos principales (1 a 5)

### Salida de resultados

- **Veredicto**: Lote aceptado o rechazado
- **Detalle de comprobaciones**: Estado de cada validación
- **Comparativa de totales**: Declarado vs. Recalculado
- **Desglose por grupos**: Subtotales por cada grupo principal

## 📁 Estructura del proyecto

```
.
├── index.html       # Interfaz HTML y estructura
├── app.js          # Lógica de validación
├── styles.css      # Estilos y diseño
└── README.md       # Este archivo
```

### Formato esperado del archivo

```
T0001B10202501010[TAB]2025/01/01[TAB]5[TAB]50000.00
GRP1[TAB]10000.00
GRP2[TAB]10000.00
GRP3[TAB]10000.00
GRP4[TAB]10000.00
GRP5[TAB]10000.00
```

**Componentes de la cabecera:**
- Código de institución: `T0001B1`
- Número de filas: `02050101`
- Fecha: `2025/01/01`
- Número de filas de datos: `5`
- Total declarado: `50000.00`

## 🎨 Tecnologías

- **HTML5**: Estructura semántica
- **CSS3**: Diseño responsivo con variables de color y tipografía personalizada
- **JavaScript vanilla**: Validación y procesamiento de datos
- **Tipografías**: IBM Plex Sans, IBM Plex Mono, Fraunces

## 📚 Académico

**Curso:** Auditoría Informática — ISWD833  
**Taller:** Nº 3 · Controles de Aplicación  
**Tema:** Sistema receptor de lotes batch  

**Grupo 3:**
- Anthony Chiluiza
- Ariel Mora
- Fernando Nagua
- Sebastián Sánchez
- Gabriel Vásconez
- Santos Villarreal

---

**Nota:** Esta aplicación implementa validaciones según especificaciones académicas de auditoría informática para demostrar controles de aplicación en sistemas de procesamiento batch.
