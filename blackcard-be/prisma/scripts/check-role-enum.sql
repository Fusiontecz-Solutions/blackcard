SELECT unnest(enum_range(NULL::"Role"))::text AS role_value ORDER BY 1;

SELECT role::text, COUNT(*) AS user_count
FROM "User"
WHERE role::text IN ('UNDERWRITER', 'SCRUBBING')
GROUP BY role::text
ORDER BY role::text;
