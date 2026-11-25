export function validateDetails(profile = {}) {
  const field = (key) => typeof profile[key] === 'string' ? profile[key].trim() : '';
  const firstName = field('firstName');
  const lastName = field('lastName');
  const address = field('address');
  const phone = field('phone').replace(/[\s()-]/g, '').replace(/^0(?=3)/, '+92');
  for (const [label, name] of [['first', firstName], ['last', lastName]]) {
    if (name.length > 60 || !/^\p{L}[\p{L}\p{M} .’'-]*$/u.test(name)) {
      return { error: 'Enter a valid ' + label + ' name.' };
    }
  }
  if (address.length < 5 || address.length > 250 || !/\p{L}/u.test(address)) {
    return { error: 'Enter your street or area and city (5 to 250 characters).' };
  }
  if (!/^\+923\d{9}$/.test(phone)) return { error: 'Enter a Pakistan mobile number, for example +92 300 1234567.' };
  return { fields: { firstName, lastName, address, phone, name: firstName + ' ' + lastName } };
}
