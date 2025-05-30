#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Settings Repository for Clarimeet

Handles database operations for user settings.
"""

import json
import logging
import time
import uuid
from typing import Dict, List, Optional, Any

from .database import get_db_connection

# Configure logging
logger = logging.getLogger(__name__)

class SettingsRepository:
    """Repository for user settings data"""
    
    @staticmethod
    def save_setting(user_id: str, key: str, value: Any) -> str:
        """
        Save a user setting
        
        Args:
            user_id: User ID
            key: Setting key
            value: Setting value (will be JSON serialized)
            
        Returns:
            str: Setting ID
        """
        setting_id = str(uuid.uuid4())
        current_time = int(time.time())
        
        # Convert value to JSON string if it's not a string
        if not isinstance(value, str):
            value = json.dumps(value)
            
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                
                # Check if setting already exists
                cursor.execute(
                    "SELECT id FROM user_settings WHERE user_id = ? AND setting_key = ?",
                    (user_id, key)
                )
                existing = cursor.fetchone()
                
                if existing:
                    # Update existing setting
                    cursor.execute(
                        """
                        UPDATE user_settings 
                        SET setting_value = ?, updated_at = ?
                        WHERE user_id = ? AND setting_key = ?
                        """,
                        (value, current_time, user_id, key)
                    )
                    setting_id = existing["id"]
                else:
                    # Insert new setting
                    cursor.execute(
                        """
                        INSERT INTO user_settings 
                        (id, user_id, setting_key, setting_value, created_at, updated_at) 
                        VALUES (?, ?, ?, ?, ?, ?)
                        """,
                        (
                            setting_id,
                            user_id,
                            key,
                            value,
                            current_time,
                            current_time
                        )
                    )
                
                conn.commit()
                
                logger.debug(f"Saved setting {key} for user {user_id}")
                return setting_id
                
        except Exception as e:
            logger.error(f"Error saving setting: {e}")
            raise
    
    @staticmethod
    def get_setting(user_id: str, key: str, default_value: Any = None) -> Any:
        """
        Get a user setting
        
        Args:
            user_id: User ID
            key: Setting key
            default_value: Default value if setting not found
            
        Returns:
            Any: Setting value (JSON deserialized if possible)
        """
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT setting_value FROM user_settings WHERE user_id = ? AND setting_key = ?",
                    (user_id, key)
                )
                result = cursor.fetchone()
                
                if result:
                    # Try to parse as JSON
                    try:
                        return json.loads(result["setting_value"])
                    except json.JSONDecodeError:
                        # Return as string if not valid JSON
                        return result["setting_value"]
                else:
                    return default_value
                
        except Exception as e:
            logger.error(f"Error getting setting {key} for user {user_id}: {e}")
            return default_value
    
    @staticmethod
    def get_all_user_settings(user_id: str) -> Dict[str, Any]:
        """
        Get all settings for a user
        
        Args:
            user_id: User ID
            
        Returns:
            Dict[str, Any]: Dictionary of settings
        """
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT setting_key, setting_value FROM user_settings WHERE user_id = ?",
                    (user_id,)
                )
                results = cursor.fetchall()
                
                settings = {}
                for row in results:
                    key = row["setting_key"]
                    value = row["setting_value"]
                    
                    # Try to parse as JSON
                    try:
                        settings[key] = json.loads(value)
                    except json.JSONDecodeError:
                        # Store as string if not valid JSON
                        settings[key] = value
                
                return settings
                
        except Exception as e:
            logger.error(f"Error getting all settings for user {user_id}: {e}")
            return {}
    
    @staticmethod
    def delete_setting(user_id: str, key: str) -> bool:
        """
        Delete a user setting
        
        Args:
            user_id: User ID
            key: Setting key
            
        Returns:
            bool: Success status
        """
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "DELETE FROM user_settings WHERE user_id = ? AND setting_key = ?",
                    (user_id, key)
                )
                conn.commit()
                
                success = cursor.rowcount > 0
                if success:
                    logger.info(f"Deleted setting {key} for user {user_id}")
                else:
                    logger.warning(f"Setting {key} not found for user {user_id}")
                
                return success
                
        except Exception as e:
            logger.error(f"Error deleting setting: {e}")
            return False
    
    @staticmethod
    def delete_all_user_settings(user_id: str) -> bool:
        """
        Delete all settings for a user
        
        Args:
            user_id: User ID
            
        Returns:
            bool: Success status
        """
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM user_settings WHERE user_id = ?", (user_id,))
                conn.commit()
                
                deleted_count = cursor.rowcount
                logger.info(f"Deleted {deleted_count} settings for user {user_id}")
                return True
                
        except Exception as e:
            logger.error(f"Error deleting user settings: {e}")
            return False
            
    @staticmethod
    def get_all_settings_with_prefix(prefix: str) -> Dict[str, Any]:
        """
        Get all settings where the user_id starts with a prefix
        
        Args:
            prefix: The prefix to search for
            
        Returns:
            Dict[str, Any]: Dictionary of settings
        """
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT user_id, setting_key, setting_value FROM user_settings WHERE user_id LIKE ?",
                    (f"{prefix}%",)
                )
                results = cursor.fetchall()
                
                settings = {}
                for row in results:
                    key = row["setting_key"]
                    value = row["setting_value"]
                    
                    # Try to parse as JSON
                    try:
                        settings[key] = {"value": json.loads(value)}
                    except json.JSONDecodeError:
                        # Store as string if not valid JSON
                        settings[key] = {"value": value}
                
                return settings
                
        except Exception as e:
            logger.error(f"Error getting settings with prefix {prefix}: {e}")
            return {}

# Create a singleton instance
settings_repository = SettingsRepository()
