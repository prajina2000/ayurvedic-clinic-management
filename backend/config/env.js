import 'dotenv/config';

export const env = {
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/ayurvedic_clinic',
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  appName: process.env.CLINIC_NAME || 'Kariyil Krishna Clinic of Ayurveda',
  clinicAddress: process.env.CLINIC_ADDRESS || '',
  clinicPhone: process.env.CLINIC_PHONE || '',
  currency: process.env.APP_CURRENCY || 'INR',
  timezone: process.env.APP_TIMEZONE || 'Asia/Kolkata',
  whatsappVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
  whatsappAccessToken: process.env.WHATSAPP_ACCESS_TOKEN,
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
  whatsappApiVersion: process.env.WHATSAPP_API_VERSION || 'v26.0',
  whatsappAppSecret: process.env.WHATSAPP_APP_SECRET,
  whatsappDefaultDepartmentId: process.env.WHATSAPP_DEFAULT_DEPARTMENT_ID,
};

if (!env.jwtSecret || env.jwtSecret.length < 32 || env.jwtSecret.startsWith('replace-with-')) throw new Error('Set a private JWT_SECRET of at least 32 characters');
