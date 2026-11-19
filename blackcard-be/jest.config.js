/** ts-jest config for backend unit tests. */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    testMatch: ['**/*.test.ts'],
    clearMocks: true,
    transform: {
        '^.+\\.tsx?$': [
            'ts-jest',
            {
                tsconfig: {
                    types: ['jest', 'node'],
                },
            },
        ],
    },
};
