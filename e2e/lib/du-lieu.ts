/* Sinh mã dữ liệu test có tiền tố AUTO_ (luật 4): dễ nhận ra và dọn; mỗi lần chạy một hậu tố riêng nên chạy lại không trùng mã.
 *   const { ma } = boSinhMa('AUTO_SP_');   ma('001') → 'AUTO_SP_001_0123045959'
 * Hậu tố là MMddHHmmss của LÚC NẠP tệp: trong một lần chạy mọi test cùng tệp dùng cùng hậu tố (đối chiếu được); lần chạy sau khác. */
export function boSinhMa(dau: string) {
  if (!/^AUTO_/.test(dau)) throw new Error(`Tiền tố dữ liệu test phải bắt đầu bằng AUTO_ (đang là "${dau}") — luật 4 trong RULES.md`);
  const hauTo = new Date().toISOString().replace(/\D/g, '').slice(4, 14);
  return { dau, hauTo, ma: (s: string) => `${dau}${s}_${hauTo}` };
}
