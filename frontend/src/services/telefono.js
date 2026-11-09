export function normalizarTelefono(valor) {
  if (typeof valor !== 'string' || !/^[+\d\s().-]+$/.test(valor)) return null;
  let n = valor.replace(/\D/g, '');
  if (n.length === 13 && n.startsWith('0056')) n = n.slice(4);
  else if (n.length === 11 && n.startsWith('56')) n = n.slice(2);
  return /^9\d{8}$/.test(n) ? n : null;
}

export function telefonoParcial(valor) {
  if (
    typeof valor !== 'string' ||
    valor.length > 40 ||
    !/^[+\d\s().-]+$/.test(valor)
  )
    return '';
  let n = valor.replace(/\D/g, '');
  if (n.length === 13 && n.startsWith('0056')) n = n.slice(4);
  else if (
    (n.length === 11 && n.startsWith('56')) ||
    valor.trim().startsWith('+56')
  )
    n = n.slice(2);
  return n.length <= 9 ? n : '';
}
