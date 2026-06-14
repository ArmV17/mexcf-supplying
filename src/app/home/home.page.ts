import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Firestore, collection, doc, updateDoc, setDoc, collectionData, addDoc } from '@angular/fire/firestore';
import * as XLSX from 'xlsx';
import { NgApexchartsModule } from 'ng-apexcharts';

interface Alimento {
  id?: string;
  categoria: string;
  alimento: string;
  maxima: number;
  minima: number;
  actual: number;
  porcion: string;
  textoEstatus?: string;
  colorEstatus?: string;
}

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, NgApexchartsModule]
})
export class HomePage implements OnInit {
  mostrarSplash = true;
  firestore: Firestore = inject(Firestore);
  cdr: ChangeDetectorRef = inject(ChangeDetectorRef);

  isDarkMode: boolean = false;
  seccionActual: string = 'resumen';
  inventario: Alimento[] = [];

  // Formularios
  formNuevo = { categoria: '', alimento: '', maxima: null, minima: null, porcion: '' };
  formRestock = { idAlimento: '', cantidad: null };
  formConsumo = { idAlimento: '', turno: '1ro', cantidad: null, encargado: '' };
  
  // Opciones de Gráfica
  public chartOptions: any;

  constructor() {
    this.inicializarGrafica();
  }

  ngOnInit() {
    setTimeout(() => { this.mostrarSplash = false; }, 1800);

    const inventarioRef = collection(this.firestore, 'inventario');
    collectionData(inventarioRef, { idField: 'id' }).subscribe((datos: any[]) => {
      this.inventario = datos;
      this.inventario.forEach(item => this.actualizarEstatus(item));
      this.actualizarGrafica();
      this.cdr.detectChanges();
    });
  }

  inicializarGrafica() {
    this.chartOptions = {
      series: [{ name: "Stock Actual", data: [] }],
      chart: { height: 350, type: "bar", toolbar: { show: false } },
      xaxis: { categories: [] },
      colors: ['#FF8C00']
    };
  }

  actualizarGrafica() {
    this.chartOptions.series = [{ name: "Stock", data: this.inventario.map(i => i.actual) }];
    this.chartOptions.xaxis = { categories: this.inventario.map(i => i.alimento) };
  }

  toggleTheme() { this.isDarkMode = !this.isDarkMode; }

  // --- OPERACIONES DE BASE DE DATOS ---

  async agregarNuevoAlimento() {
    if (!this.formNuevo.alimento) return;
    const docId = this.formNuevo.alimento.toLowerCase().trim().replace(/\s+/g, '-');
    await setDoc(doc(this.firestore, 'inventario', docId), { ...this.formNuevo });
    alert('Alimento agregado.');
    this.formNuevo = { categoria: '', alimento: '', maxima: null, minima: null, porcion: '' };
  }

  async registrarIngresoStock() {
    if (!this.formRestock.idAlimento) return;
    const item = this.inventario.find(i => i.id === this.formRestock.idAlimento);
    if (item) {
      await updateDoc(doc(this.firestore, 'inventario', item.id!), { 
        actual: Number(item.actual) + Number(this.formRestock.cantidad) 
      });
      alert('Stock sumado.');
    }
  }

  async registrarConsumoTurno() {
    if (!this.formConsumo.idAlimento) return;
    const item = this.inventario.find(i => i.id === this.formConsumo.idAlimento);
    if (item) {
      const nueva = Math.max(0, Number(item.actual) - Number(this.formConsumo.cantidad));
      await updateDoc(doc(this.firestore, 'inventario', item.id!), { actual: nueva });
      alert('Consumo registrado.');
    }
  }

  // --- CERRAR TURNO Y EXPORTAR ---

  async cerrarTurno() {
    // 1. Guardar reporte en historial
    try {
      await addDoc(collection(this.firestore, 'historial_turnos'), {
        fecha: new Date().toISOString(),
        inventarioSnapshot: this.inventario,
        totalItems: this.inventario.length
      });
      alert('Turno cerrado: Historial guardado.');
      this.exportarExcel();
    } catch (e) { alert('Error al cerrar turno.'); }
  }

  exportarExcel() {
    const ws: XLSX.WorkSheet = XLSX.utils.json_to_sheet(this.inventario);
    const wb: XLSX.WorkBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
    XLSX.writeFile(wb, 'Reporte_Inventario.xlsx');
  }

  actualizarEstatus(item: Alimento) {
    if (item.actual <= 0) {
      item.textoEstatus = 'AGOTADO'; item.colorEstatus = 'var(--status-rojo)';
    } else if (item.actual <= item.minima) {
      item.textoEstatus = 'REABASTECER'; item.colorEstatus = 'var(--status-ambar)';
    } else {
      item.textoEstatus = 'EN STOCK'; item.colorEstatus = 'var(--status-verde)';
    }
  }
}