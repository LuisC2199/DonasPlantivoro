export const isValidEmail = (email: string) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
};

export const isValidPhone = (phone: string) => {
  // MX-style: only digits, 10 numbers (WhatsApp friendly)
  return /^\d{10}$/.test(phone.replace(/\D/g, ""));
};
