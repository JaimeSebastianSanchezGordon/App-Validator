/* ============================================================
   VALIDADOR DE LOTE BATCH
   Implementa todas las validaciones de la sección 2.2 del taller.
   ============================================================ */

const TAB = '\t';
const FILENAME_REGEX = /^T\d{4}B[1-4]\d{8}\.txt$/;
const DATE_REGEX = /^\d{2}\/\d{2}\/\d{4}$/;

const fileInput   = document.getElementById('fileInput');
const fileNameEl  = document.getElementById('fileName');
const validateBtn = document.getElementById('validateBtn');
const resultsEl   = document.getElementById('results');

let currentFile = null;

fileInput.addEventListener('change', (e) => {
  currentFile = e.target.files[0] || null;
  if (currentFile) {
    fileNameEl.textContent = currentFile.name;
    fileNameEl.classList.remove('empty');
    validateBtn.disabled = false;
  } else {
    fileNameEl.textContent = 'Ningún archivo seleccionado';
    fileNameEl.classList.add('empty');
    validateBtn.disabled = true;
  }
  resultsEl.classList.remove('show');
});

validateBtn.addEventListener('click', async () => {
  if (!currentFile) return;
  const text = await currentFile.text();
  const result = validate(currentFile.name, text);
  render(result);
});

/* ── Validación principal ── */

function validate(filename, text) {
  const checks = [];
  let rejected = false;

  // 1. Validar que el nombre del archivo tenga el formato correcto
  const filenameCheck = validateFilename(filename);
  checks.push(filenameCheck);
  if (!filenameCheck.ok) rejected = true;

  // Extraer el código de institución del nombre (primeros 5 caracteres) para cruzarlo con la cabecera
  const expectedInstitution = filenameCheck.ok ? filename.substring(0, 5) : null;

  // Separar el texto en líneas, soportando saltos de línea Windows (\r\n) y Unix (\n)
  const rawLines = text.split(/\r?\n/);

  // Detectar si la última línea está vacía (línea en blanco al final del archivo)
  const lastLineEmpty = rawLines.length > 0 && rawLines[rawLines.length - 1].trim() === '';

  // Si hay línea vacía al final, ignorarla para el procesamiento
  const lines = lastLineEmpty ? rawLines.slice(0, -1) : rawLines.slice();

  // Si el archivo no tiene ningún contenido, rechazar inmediatamente
  if (lines.length === 0) {
    checks.push({ ok: false, name: 'Contenido del archivo', detail: 'El archivo está vacío.' });
    return { rejected: true, checks };
  }

  // 2. Validar la cabecera (primera línea): institución, fecha, número de filas y total declarado
  const headerCheck = validateHeader(lines[0], expectedInstitution);
  checks.push(headerCheck);
  if (!headerCheck.ok) rejected = true;

  // 3. Verificar que no existan líneas vacías al final del archivo
  const trailingEmptyCheck = {
    ok: !lastLineEmpty,
    name: 'Líneas vacías al final',
    detail: lastLineEmpty
      ? 'La última línea del archivo está vacía. El número de filas útiles no es correcto.'
      : 'No hay líneas vacías al final del archivo.'
  };
  checks.push(trailingEmptyCheck);
  if (!trailingEmptyCheck.ok) rejected = true;

  // Tomar las líneas de datos (todo después de la cabecera), descartando líneas en blanco intermedias
  const dataLines = lines.slice(1).filter(l => l.trim() !== '');

  // 4. Validar que cada línea de datos use tabulador como separador y tenga el formato código+monto
  const separatorCheck = validateSeparator(dataLines);
  checks.push(separatorCheck);
  if (!separatorCheck.ok) rejected = true;

  // Si la cabecera o el separador fallaron, no es posible continuar con validaciones numéricas
  if (!headerCheck.ok || !separatorCheck.ok) {
    return { rejected: true, checks };
  }

  // Convertir cada línea de datos a un objeto { code, amount } para operar con sus valores
  const parsedRows = dataLines.map(parseDataRow);

  // 5. Comparar el número de filas encontradas contra lo declarado en la cabecera
  const rowCountCheck = {
    ok: parsedRows.length === headerCheck.declaredRows,
    name: 'Conteo de filas útiles',
    detail: parsedRows.length === headerCheck.declaredRows
      ? `Filas útiles encontradas: ${parsedRows.length} (coincide con la cabecera).`
      : `La cabecera declara ${headerCheck.declaredRows} filas, pero se encontraron ${parsedRows.length} filas útiles.`
  };
  checks.push(rowCountCheck);
  if (!rowCountCheck.ok) rejected = true;

  // Acumular los montos por grupo principal (códigos del 1 al 5)
  // Se trabaja en centavos enteros para evitar errores de punto flotante
  const subtotalsByGroup = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const row of parsedRows) {
    if (row.code.length === 1 && /^[1-5]$/.test(row.code)) {
      subtotalsByGroup[row.code] += Math.round(row.amount * 100);
    }
  }

  // Sumar todos los subtotales de los 5 grupos y convertir de vuelta a unidades monetarias
  const sumGroupsCents = Object.values(subtotalsByGroup).reduce((a, b) => a + b, 0);
  const sumGroups      = sumGroupsCents / 100;

  // Convertir el total declarado en la cabecera también a centavos para comparar sin decimales
  const declaredCents  = Math.round(headerCheck.declaredTotal * 100);

  // 6. Comparar el total recalculado por el receptor contra el total declarado por el origen
  const totalCheck = {
    ok: sumGroupsCents === declaredCents,
    name: 'Suma de subtotales (control batch principal)',
    detail: sumGroupsCents === declaredCents
      ? `La suma de los 5 grupos principales coincide con el total declarado (${formatMoney(sumGroups)}).`
      : `Discrepancia: el receptor recalculó ${formatMoney(sumGroups)}, pero la cabecera declara ${formatMoney(headerCheck.declaredTotal)}. Diferencia: ${formatMoney(Math.abs(sumGroups - headerCheck.declaredTotal))}.`
  };
  checks.push(totalCheck);
  if (!totalCheck.ok) rejected = true;

  return {
    rejected,
    checks,
    header: headerCheck,
    rowCount: parsedRows.length,
    subtotalsByGroup: Object.fromEntries(
      Object.entries(subtotalsByGroup).map(([k, v]) => [k, v / 100])
    ),
    sumGroups,
    declaredTotal: headerCheck.declaredTotal,
    totalsMatch: sumGroupsCents === declaredCents
  };
}

/* ── Validaciones individuales ── */

function validateFilename(name) {
  // Verificar el nombre completo contra la expresión regular del formato esperado
  if (!FILENAME_REGEX.test(name)) {
    // Si falla, identificar exactamente cuál parte del nombre es incorrecta
    let reason = 'El nombre no cumple con el formato TVWXYBZDDMMAAAA.txt.';
    if (!name.toLowerCase().endsWith('.txt')) {
      reason = 'El archivo debe tener extensión .txt.';
    } else if (name.length !== 19) {
      // El formato tiene 15 caracteres de nombre + 4 de extensión (.txt) = 19 en total
      reason = `El nombre del archivo debe tener exactamente 19 caracteres (incluida la extensión). Tiene ${name.length}.`;
    } else if (name[0] !== 'T') {
      reason = 'El primer carácter del nombre debe ser la letra T.';
    } else if (!/^\d{4}$/.test(name.substring(1, 5))) {
      // Posiciones 2-5: código de institución (4 dígitos)
      reason = 'Las posiciones 2 a 5 (VWXY) deben ser dígitos.';
    } else if (name[5] !== 'B') {
      // Posición 6: separador fijo "B" que identifica el tipo de archivo
      reason = 'La posición 6 del nombre debe ser la letra B.';
    } else if (!/^[1-4]$/.test(name[6])) {
      // Posición 7: código de tipo de balance (1=activo, 2=pasivo, 3=patrimonio, 4=resultados)
      reason = `El código de balance (Z) debe ser 1, 2, 3 o 4. Se encontró: "${name[6]}".`;
    } else if (!/^\d{8}$/.test(name.substring(7, 15))) {
      // Posiciones 8-15: fecha de corte en formato DDMMAAAA (sin separadores)
      reason = 'La fecha de corte (DDMMAAAA) debe contener 8 dígitos.';
    }
    return { ok: false, name: 'Nombre del archivo', detail: reason };
  }
  return { ok: true, name: 'Nombre del archivo', detail: `Formato correcto: ${name}` };
}

function validateHeader(line, expectedInstitution) {
  // La cabecera debe tener exactamente 4 campos separados por tabulador:
  // [código institución] [fecha de corte] [número de filas] [total monetario]
  const parts = line.split(TAB);

  if (parts.length !== 4) {
    return {
      ok: false,
      name: 'Cabecera (primera línea)',
      detail: `La cabecera debe contener exactamente 4 valores separados por tabulador. Se encontraron ${parts.length}.`
    };
  }

  const [institution, date, rowsStr, totalStr] = parts;

  // Verificar que el código de institución en la cabecera coincida con el del nombre del archivo
  if (expectedInstitution && institution !== expectedInstitution) {
    return {
      ok: false,
      name: 'Cabecera (primera línea)',
      detail: `El código de la institución en la cabecera ("${institution}") no coincide con el del nombre del archivo ("${expectedInstitution}").`
    };
  }

  // Verificar que la fecha de corte tenga el formato DD/MM/YYYY
  if (!DATE_REGEX.test(date)) {
    return {
      ok: false,
      name: 'Cabecera (primera línea)',
      detail: `La fecha de corte "${date}" no cumple con el formato DD/MM/YYYY.`
    };
  }

  // Verificar que el número de filas declarado sea un entero positivo válido
  const declaredRows = parseInt(rowsStr, 10);
  if (!/^\d+$/.test(rowsStr) || isNaN(declaredRows)) {
    return {
      ok: false,
      name: 'Cabecera (primera línea)',
      detail: `El número de filas declarado ("${rowsStr}") no es un entero válido.`
    };
  }

  // Verificar que el total monetario declarado sea un número válido (puede ser negativo o decimal)
  const declaredTotal = parseFloat(totalStr);
  if (!/^-?\d+(\.\d+)?$/.test(totalStr) || isNaN(declaredTotal)) {
    return {
      ok: false,
      name: 'Cabecera (primera línea)',
      detail: `El total monetario declarado ("${totalStr}") no es un número válido.`
    };
  }

  return {
    ok: true,
    name: 'Cabecera (primera línea)',
    detail: `Institución: ${institution} · Fecha: ${date} · Filas declaradas: ${declaredRows} · Total declarado: ${formatMoney(declaredTotal)}`,
    institution,
    date,
    declaredRows,
    declaredTotal
  };
}

function validateSeparator(dataLines) {
  // Recorrer cada línea de datos y verificar que tenga exactamente 2 campos: código y monto
  for (let i = 0; i < dataLines.length; i++) {
    const line  = dataLines[i];
    const parts = line.split(TAB);

    // Si al dividir por tabulador se obtiene menos de 2 partes, no se está usando el separador correcto
    if (parts.length < 2) {
      return {
        ok: false,
        name: 'Separador y formato de filas',
        detail: `Línea ${i + 2}: no usa tabulador como separador o tiene menos valores de los esperados. Contenido: "${truncate(line, 60)}".`
      };
    }

    // Si hay más de 2 partes, la línea tiene campos extra no esperados
    if (parts.length !== 2) {
      return {
        ok: false,
        name: 'Separador y formato de filas',
        detail: `Línea ${i + 2}: se esperaban 2 valores separados por tabulador (código y monto), se encontraron ${parts.length}.`
      };
    }

    const [code, amountStr] = parts;

    // El código debe ser solo dígitos (ej: "1", "12", "301")
    if (!/^\d+$/.test(code)) {
      return {
        ok: false,
        name: 'Separador y formato de filas',
        detail: `Línea ${i + 2}: el código "${code}" no es numérico.`
      };
    }

    // El monto debe ser un número válido, opcionalmente negativo y/o con decimales
    if (!/^-?\d+(\.\d+)?$/.test(amountStr)) {
      return {
        ok: false,
        name: 'Separador y formato de filas',
        detail: `Línea ${i + 2}: el monto "${amountStr}" no es un número válido.`
      };
    }
  }
  return {
    ok: true,
    name: 'Separador y formato de filas',
    detail: `Las ${dataLines.length} líneas útiles usan tabulador como separador y tienen el formato esperado.`
  };
}

function parseDataRow(line) {
  const [code, amountStr] = line.split(TAB);
  return { code, amount: parseFloat(amountStr) };
}

/* ── Utilidades ── */

function formatMoney(n) {
  return n.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function truncate(s, n) {
  return s.length > n ? s.substring(0, n) + '…' : s;
}

/* ── Renderizado ── */

function render(result) {
  resultsEl.classList.add('show');

  const verdictEl = document.getElementById('verdict');
  verdictEl.className = 'verdict ' + (result.rejected ? 'fail' : 'pass');
  verdictEl.innerHTML = `
    <div class="verdict-stamp">${result.rejected ? 'RECHAZADO' : 'ACEPTADO'}</div>
    <div class="verdict-text">
      <div class="verdict-title">
        ${result.rejected ? 'El lote fue rechazado' : 'El lote fue aceptado y puede procesarse'}
      </div>
      <div class="verdict-sub">
        ${result.rejected
          ? 'Se detectaron incidencias en al menos una validación. Revise el detalle abajo.'
          : 'Todas las validaciones del control batch fueron superadas con éxito.'}
      </div>
    </div>
  `;

  const checksEl = document.getElementById('checks');
  checksEl.innerHTML = result.checks.map(c => `
    <div class="check ${c.ok ? 'ok' : 'fail'}">
      <div class="check-icon">${c.ok ? '✓' : '✗'}</div>
      <div class="check-body">
        <div class="check-name">${escapeHtml(c.name)}</div>
        <div class="check-detail">${escapeHtml(c.detail)}</div>
      </div>
      <div class="check-status">${c.ok ? 'OK' : 'Falla'}</div>
    </div>
  `).join('');

  const totalsSection    = document.getElementById('totalsSection');
  const breakdownSection = document.getElementById('breakdownSection');

  if (result.subtotalsByGroup && result.declaredTotal !== undefined) {
    totalsSection.style.display    = 'block';
    breakdownSection.style.display = 'block';

    const matchClass = result.totalsMatch ? 'match' : 'mismatch';
    document.getElementById('declaredCard').className = 'total-card ' + matchClass;
    document.getElementById('recalcCard').className   = 'total-card ' + matchClass;

    document.getElementById('declaredTotal').innerHTML =
      `<span class="currency">USD</span>${formatMoney(result.declaredTotal)}`;
    document.getElementById('recalcTotal').innerHTML =
      `<span class="currency">USD</span>${formatMoney(result.sumGroups)}`;

    document.getElementById('rowCountInfo').textContent =
      `${result.rowCount} filas útiles procesadas`;

    document.getElementById('subtotalsBody').innerHTML =
      Object.entries(result.subtotalsByGroup).map(([g, v]) => `
        <tr>
          <td><span class="group-tag">${g}</span> Grupo ${g}</td>
          <td class="num">${formatMoney(v)}</td>
        </tr>
      `).join('');

    document.getElementById('sumOfGroups').textContent = formatMoney(result.sumGroups);
  } else {
    totalsSection.style.display    = 'none';
    breakdownSection.style.display = 'none';
  }

  resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
