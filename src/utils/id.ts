export function generateOrderCode(date = new Date()) {
  const year = date.getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `MF-${year}-${rand}`;
}
