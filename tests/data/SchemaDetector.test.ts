import { describe, it, expect } from 'vitest';
import { mapDuckDBType } from '@/data/SchemaDetector';

describe('SchemaDetector', () => {
  describe('mapDuckDBType', () => {
    describe('integer types', () => {
      it('should map BIGINT to integer', () => {
        expect(mapDuckDBType('BIGINT')).toBe('integer');
        expect(mapDuckDBType('INT8')).toBe('integer');
        expect(mapDuckDBType('LONG')).toBe('integer');
      });

      it('should map INTEGER to integer', () => {
        expect(mapDuckDBType('INTEGER')).toBe('integer');
        expect(mapDuckDBType('INT4')).toBe('integer');
        expect(mapDuckDBType('INT')).toBe('integer');
        expect(mapDuckDBType('SIGNED')).toBe('integer');
      });

      it('should map SMALLINT to integer', () => {
        expect(mapDuckDBType('SMALLINT')).toBe('integer');
        expect(mapDuckDBType('INT2')).toBe('integer');
        expect(mapDuckDBType('SHORT')).toBe('integer');
      });

      it('should map TINYINT to integer', () => {
        expect(mapDuckDBType('TINYINT')).toBe('integer');
        expect(mapDuckDBType('INT1')).toBe('integer');
      });

      it('should map unsigned integer types to integer', () => {
        expect(mapDuckDBType('UBIGINT')).toBe('integer');
        expect(mapDuckDBType('UINTEGER')).toBe('integer');
        expect(mapDuckDBType('USMALLINT')).toBe('integer');
        expect(mapDuckDBType('UTINYINT')).toBe('integer');
      });

      it('should map HUGEINT types to integer', () => {
        expect(mapDuckDBType('HUGEINT')).toBe('integer');
        expect(mapDuckDBType('UHUGEINT')).toBe('integer');
      });
    });

    describe('float types', () => {
      it('should map FLOAT to float', () => {
        expect(mapDuckDBType('FLOAT')).toBe('float');
        expect(mapDuckDBType('FLOAT4')).toBe('float');
        expect(mapDuckDBType('REAL')).toBe('float');
      });

      it('should map DOUBLE to float', () => {
        expect(mapDuckDBType('DOUBLE')).toBe('float');
        expect(mapDuckDBType('FLOAT8')).toBe('float');
      });
    });

    describe('decimal types', () => {
      it('should map DECIMAL to decimal', () => {
        expect(mapDuckDBType('DECIMAL')).toBe('decimal');
        expect(mapDuckDBType('DECIMAL(10,2)')).toBe('decimal');
        expect(mapDuckDBType('NUMERIC')).toBe('decimal');
        expect(mapDuckDBType('NUMERIC(18,4)')).toBe('decimal');
      });
    });

    describe('boolean types', () => {
      it('should map BOOLEAN to boolean', () => {
        expect(mapDuckDBType('BOOLEAN')).toBe('boolean');
        expect(mapDuckDBType('BOOL')).toBe('boolean');
        expect(mapDuckDBType('LOGICAL')).toBe('boolean');
      });
    });

    describe('date type', () => {
      it('should map DATE to date', () => {
        expect(mapDuckDBType('DATE')).toBe('date');
      });
    });

    describe('timestamp types', () => {
      it('should map TIMESTAMP to timestamp', () => {
        expect(mapDuckDBType('TIMESTAMP')).toBe('timestamp');
        expect(mapDuckDBType('DATETIME')).toBe('timestamp');
      });

      it('should map timezone-aware timestamps to timestamp', () => {
        expect(mapDuckDBType('TIMESTAMP WITH TIME ZONE')).toBe('timestamp');
        expect(mapDuckDBType('TIMESTAMPTZ')).toBe('timestamp');
      });

      it('should map precision timestamps to timestamp', () => {
        expect(mapDuckDBType('TIMESTAMP_S')).toBe('timestamp');
        expect(mapDuckDBType('TIMESTAMP_MS')).toBe('timestamp');
        expect(mapDuckDBType('TIMESTAMP_NS')).toBe('timestamp');
      });
    });

    describe('time types', () => {
      it('should map TIME to time', () => {
        expect(mapDuckDBType('TIME')).toBe('time');
      });

      it('should map timezone-aware time to time', () => {
        expect(mapDuckDBType('TIME WITH TIME ZONE')).toBe('time');
        expect(mapDuckDBType('TIMETZ')).toBe('time');
      });
    });

    describe('interval type', () => {
      it('should map INTERVAL to interval', () => {
        expect(mapDuckDBType('INTERVAL')).toBe('interval');
      });
    });

    describe('string types', () => {
      it('should map VARCHAR to string', () => {
        expect(mapDuckDBType('VARCHAR')).toBe('string');
        expect(mapDuckDBType('VARCHAR(255)')).toBe('string');
      });

      it('should map CHAR to string', () => {
        expect(mapDuckDBType('CHAR')).toBe('string');
        expect(mapDuckDBType('CHAR(10)')).toBe('string');
      });

      it('should map TEXT/STRING to string', () => {
        expect(mapDuckDBType('TEXT')).toBe('string');
        expect(mapDuckDBType('STRING')).toBe('string');
      });

      it('should map UUID to string', () => {
        expect(mapDuckDBType('UUID')).toBe('string');
      });

      it('should map BLOB to string', () => {
        expect(mapDuckDBType('BLOB')).toBe('string');
      });

      it('should map JSON to string', () => {
        expect(mapDuckDBType('JSON')).toBe('string');
      });
    });

    describe('complex types (fallback to string)', () => {
      it('should map array types to string', () => {
        expect(mapDuckDBType('INTEGER[]')).toBe('string');
        expect(mapDuckDBType('VARCHAR[]')).toBe('string');
      });

      it('should map MAP/STRUCT types to string', () => {
        expect(mapDuckDBType('MAP(VARCHAR, INTEGER)')).toBe('string');
        expect(mapDuckDBType('STRUCT(a INTEGER, b VARCHAR)')).toBe('string');
      });

      it('should map LIST types to string', () => {
        expect(mapDuckDBType('LIST')).toBe('string');
      });

      it('should map unknown types to string', () => {
        expect(mapDuckDBType('SOME_UNKNOWN_TYPE')).toBe('string');
      });
    });

    describe('case insensitivity', () => {
      it('should handle lowercase types', () => {
        expect(mapDuckDBType('integer')).toBe('integer');
        expect(mapDuckDBType('varchar')).toBe('string');
        expect(mapDuckDBType('timestamp')).toBe('timestamp');
      });

      it('should handle mixed case types', () => {
        expect(mapDuckDBType('Integer')).toBe('integer');
        expect(mapDuckDBType('VarChar')).toBe('string');
        expect(mapDuckDBType('TimeStamp')).toBe('timestamp');
      });
    });

    describe('whitespace handling', () => {
      it('should trim whitespace', () => {
        expect(mapDuckDBType('  INTEGER  ')).toBe('integer');
        expect(mapDuckDBType('VARCHAR ')).toBe('string');
      });
    });
  });
});
