import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

interface Alimento {
  categoria: string;
  alimento: string;
  maxima: number;
  minima: number;
  actual: number;
  porcion: string;
  consumoTurno?: number | null;
  textoEstatus?: string;
  colorEstatus?: string;
}

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class HomePage implements OnInit {
  mostrarSplash = true;

  registro = {
    turno: '',
    encargado: '',
    fecha: new Date().toISOString().split('T')[0], // Fecha actual por defecto
    trabajadores: null
  };

  inventario: Alimento[] = [
    // VERDURAS
    { categoria: 'VERDURAS', alimento: 'Zanahoria', maxima: 24, minima: 10, actual: 24, porcion: 'Pendiente' },
    { categoria: 'VERDURAS', alimento: 'Elote', maxima: 30, minima: 10, actual: 30, porcion: 'Pendiente' },
    { categoria: 'VERDURAS', alimento: 'Papa', maxima: 40, minima: 16, actual: 40, porcion: 'Pendiente' },
    { categoria: 'VERDURAS', alimento: 'Cebolla', maxima: 20, minima: 4, actual: 20, porcion: 'Pendiente' },
    { categoria: 'VERDURAS', alimento: 'Jitomate', maxima: 24, minima: 6, actual: 24, porcion: 'Pendiente' },
    
    // CEREAL
    { categoria: 'CEREAL', alimento: 'Arroz', maxima: 36, minima: 16, actual: 36, porcion: 'Pendiente' },
    { categoria: 'CEREAL', alimento: 'Fideo', maxima: 30, minima: 16, actual: 30, porcion: 'Pendiente' },
    { categoria: 'CEREAL', alimento: 'Tortillas de maíz', maxima: 30, minima: 12, actual: 30, porcion: 'Pendiente' },
    
    // LEGUMINOSAS
    { categoria: 'LEGUMINOSAS', alimento: 'Frijoles', maxima: 46, minima: 40, actual: 46, porcion: 'Pendiente' },
    { categoria: 'LEGUMINOSAS', alimento: 'Lentejas', maxima: 46, minima: 40, actual: 46, porcion: 'Pendiente' },
    
    // CARNES, HUEVO Y PESCADO
    { categoria: 'CARNES', alimento: 'Huevo', maxima: 34.5, minima: 18.4, actual: 34.5, porcion: 'Pendiente' },
    { categoria: 'CARNES', alimento: 'Pollo', maxima: 57.5, minima: 50, actual: 57.5, porcion: 'Pendiente' },
    { categoria: 'CARNES', alimento: 'Res', maxima: 57.5, minima: 50, actual: 57.5, porcion: 'Pendiente' },
    
    // LACTEOS
    { categoria: 'LÁCTEOS', alimento: 'Leche', maxima: 28.75, minima: 25, actual: 28.75, porcion: 'Pendiente' },
    { categoria: 'LÁCTEOS', alimento: 'Queso', maxima: 3.45, minima: 3, actual: 3.45, porcion: 'Pendiente' },

    // FRUTAS
    { categoria: 'FRUTAS', alimento: 'Manzana', maxima: 80, minima: 32, actual: 80, porcion: 'Pendiente' },
    { categoria: 'FRUTAS', alimento: 'Sandía', maxima: 120, minima: 40, actual: 120, porcion: 'Pendiente' },

    // OTROS
    { categoria: 'OTROS', alimento: 'Agua', maxima: 57.5, minima: 50, actual: 57.5, porcion: 'Pendiente' },
    { categoria: 'OTROS', alimento: 'Aceite', maxima: 1.15, minima: 1, actual: 1.15, porcion: 'Pendiente' }
  ];

  ngOnInit() {
    setTimeout(() => {
      this.mostrarSplash = false;
    }, 3000);

    this.inventario.forEach(item => this.actualizarEstatus(item));
  }

  actualizarEstatus(item: Alimento) {
    if (item.actual <= 0) {
      item.textoEstatus = 'AGOTADO';
      item.colorEstatus = 'var(--status-rojo)';
    } else if (item.actual <= item.minima || item.actual <= (item.maxima * 0.5)) {
      item.textoEstatus = 'REABASTECER';
      item.colorEstatus = 'var(--status-ambar)';
    } else {
      item.textoEstatus = 'EN STOCK';
      item.colorEstatus = 'var(--status-verde)';
    }
  }

  restarConsumo(item: Alimento) {
    if (item.consumoTurno && item.consumoTurno > 0) {
      item.actual = Number((item.actual - item.consumoTurno).toFixed(2));
      
      if (item.actual < 0) {
        item.actual = 0;
      }
      
      item.consumoTurno = null;
      this.actualizarEstatus(item);
    }
  }

  guardarCierreDeTurno() {
    if (!this.registro.turno || !this.registro.encargado) {
      alert('Por favor, completa el Turno y el Encargado antes de cerrar.');
      return;
    }

    const reporteFinal = {
      turno: this.registro.turno,
      encargado: this.registro.encargado,
      fecha: this.registro.fecha,
      trabajadoresAtendidos: this.registro.trabajadores,
      estadoInventario: this.inventario
    };

    console.log('Datos listos para enviar a Firebase:', reporteFinal);
    alert(`Turno cerrado exitosamente.\nTrabajadores atendidos: ${this.registro.trabajadores || 0}`);
    
    this.registro.trabajadores = null;
  }
}