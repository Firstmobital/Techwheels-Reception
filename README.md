# Techwheels-Reception

## Login (Phase 1)

- App now requires login before accessing kiosk/reception screens.
- Default credentials:
	- ID: `admin`
	- Password: `admin123`
- To override credentials, create a `.env.local` file in project root:

```env
VITE_LOGIN_ID=your-id
VITE_LOGIN_PASSWORD=your-password
```

- Login session persists across refresh and ends on Logout.
- This is a simple frontend credential gate for phase 1, not production-grade authentication.
