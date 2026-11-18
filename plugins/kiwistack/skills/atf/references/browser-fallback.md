# Browser fallback

If you edit a test in the ATF UI, first switch the application picker to your scope and the update set picker to the `kiwi/` set. Otherwise saves land in the app's **Default** set, and switching the application in the browser also resets the update set the MCP server writes to. Afterwards check `sn_instance_info` (`update_set_ok`) and `sn_update_set` action `contents`.
