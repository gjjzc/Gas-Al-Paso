import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/Auth.jsx';
import { CarritoProvider } from './context/Carrito.jsx';
import { App, LimiteErrores } from './App.jsx';
import './styles.css';
createRoot(document.getElementById('root')).render(
  <LimiteErrores>
    <BrowserRouter>
      <AuthProvider>
        <CarritoProvider>
          <App />
        </CarritoProvider>
      </AuthProvider>
    </BrowserRouter>
  </LimiteErrores>,
);
