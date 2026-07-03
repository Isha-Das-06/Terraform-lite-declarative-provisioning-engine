export declare enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3
}
declare class Logger {
    private level;
    setLevel(level: LogLevel): void;
    debug(message: string, data?: any): void;
    info(message: string, data?: any): void;
    warn(message: string, data?: any): void;
    error(message: string, error?: any): void;
    success(message: string): void;
    failure(message: string): void;
}
export declare const logger: Logger;
export {};
//# sourceMappingURL=logger.d.ts.map