# Multi-tenant architecture for Clinics SaaS

## Estrutura Multi-tenant

Cada clínica terá:
- Schema dedicado no PostgreSQL (isolamento de dados)
- Filas Redis separadas
- Configurações independentes

## Tenants (Clínicas)
- clinica_1
- clinica_2
- clinica_3
- ...

## Vantagens
- Isolamento total de dados
- Performance (schemas menores)
- Backup por clínica
- Migração facilitada
- Compliance LGPD
