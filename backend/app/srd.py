"""
SRD - Shared Runtime Data / Server-Rendered Data

Este arquivo armazena dados compartilhados em runtime para:
- Cache de dados frequentes
- Estado compartilhado entre requisições
- Dados de configuração dinâmica

Uso: Importar e usar como repositório em memória
"""

from typing import Dict, Any, Optional
from datetime import datetime, timedelta

class SRD:
    """Shared Runtime Data - Armazena dados em memória compartilhada"""

    _data: Dict[str, Any] = {}
    _expiry: Dict[str, datetime] = {}

    @classmethod
    def set(cls, key: str, value: Any, ttl_seconds: Optional[int] = None) -> None:
        """
        Define um valor no SRD

        Args:
            key: Chave do dado
            value: Valor a ser armazenado
            ttl_seconds: Tempo de vida em segundos (opcional)
        """
        cls._data[key] = value
        if ttl_seconds:
            cls._expiry[key] = datetime.now() + timedelta(seconds=ttl_seconds)

    @classmethod
    def get(cls, key: str, default: Any = None) -> Any:
        """
        Recupera um valor do SRD

        Args:
            key: Chave do dado
            default: Valor padrão se não existir

        Returns:
            O valor armazenado ou default
        """
        # Verifica se expirou
        if key in cls._expiry:
            if datetime.now() > cls._expiry[key]:
                cls._data.pop(key, None)
                cls._expiry.pop(key, None)
                return default

        return cls._data.get(key, default)

    @classmethod
    def delete(cls, key: str) -> bool:
        """Remove uma chave do SRD"""
        cls._data.pop(key, None)
        cls._expiry.pop(key, None)
        return True

    @classmethod
    def clear(cls) -> None:
        """Limpa todo o SRD"""
        cls._data.clear()
        cls._expiry.clear()

    @classmethod
    def keys(cls) -> list:
        """Retorna todas as chaves"""
        return list(cls._data.keys())

# Instância global
srd = SRD()
