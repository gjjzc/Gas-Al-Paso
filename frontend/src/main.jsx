import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Inicio } from './pages/Inicio.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <BrowserRouter><Routes><Route path="/" element={<Inicio />} /></Routes></BrowserRouter>,
);
