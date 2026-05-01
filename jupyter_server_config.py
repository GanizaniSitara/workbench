c.ServerApp.allow_origin = "http://127.0.0.1:3000"  # type: ignore[name-defined]
c.ServerApp.disable_check_xsrf = True  # type: ignore[name-defined]
c.ServerApp.open_browser = False  # type: ignore[name-defined]
c.ServerApp.password = ""  # type: ignore[name-defined]
c.ServerApp.port = 8888  # type: ignore[name-defined]
c.ServerApp.token = ""  # type: ignore[name-defined]
c.ServerApp.tornado_settings = {  # type: ignore[name-defined]
    "headers": {
        "Content-Security-Policy": (
            "frame-ancestors 'self' http://127.0.0.1:3000; "
            "report-uri /api/security/csp-report"
        )
    }
}
