import { createLogger, format, transports } from 'winston';
import { utilities as nestWinstonModuleUtilities } from 'nest-winston';

const { combine, timestamp, errors, json } = format;
const isProduction = process.env.NODE_ENV === 'production';

export const winstonLogger = createLogger({
  level: isProduction ? 'warn' : 'debug',
  format: isProduction
    ? combine(timestamp(), errors({ stack: true }), json())
    : combine(
        timestamp(),
        errors({ stack: true }),
        nestWinstonModuleUtilities.format.nestLike('App', {
          prettyPrint: true,
          colors: true,
        }),
      ),
  transports: [
    new transports.Console(),
    // Production এ file এ লিখবে
    ...(isProduction
      ? [
          new transports.File({ filename: 'logs/error.log', level: 'error' }),
          new transports.File({ filename: 'logs/combined.log' }),
        ]
      : []),
  ],
});
