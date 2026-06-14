import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Firestore, collection, doc, setDoc, collectionData } from '@angular/fire/firestore';
import * as XLSX from 'xlsx';

interface Alimento {
  id?: string;
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
  firestore: Firestore = inject(Firestore);
  
  // INYECTAMOS EL DETECTOR DE CAMBIOS PARA FORZAR EL TIEMPO REAL
  cdr: ChangeDetectorRef = inject(ChangeDetectorRef); 
  
  registro = { turno: '', encargado: '', fecha: new Date().toISOString().split('T')[0], trabajadores: null };
  inventario: Alimento[] = []; 

  ngOnInit() {
    setTimeout(() => { this.mostrarSplash = false; }, 1800);

    const inventarioRef = collection(this.firestore, 'inventario');
    
    // ESCUCHADOR EN TIEMPO REAL
    collectionData(inventarioRef, { idField: 'id' }).subscribe((datos: any[]) => {
      this.inventario = datos;
      this.inventario.forEach(item => this.actualizarEstatus(item));
      
      // LA MAGIA ESTÁ AQUÍ: Obliga a la interfaz a actualizarse instantáneamente
      this.cdr.detectChanges(); 
    });
  }

  importarExcel(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    
    reader.onload = async (e: any) => {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const datosExcel = XLSX.utils.sheet_to_json(worksheet) as any[];

      let categoriaActual = 'GENERAL';

      for (const filaRaw of datosExcel) {
        const fila: any = {};
        for (const key in filaRaw) {
          fila[key.trim().toUpperCase()] = filaRaw[key];
        }

        if (fila['__EMPTY'] && typeof fila['__EMPTY'] === 'string' && fila['__EMPTY'].trim() !== '') {
          categoriaActual = fila['__EMPTY'].trim();
        } else if (fila['CATEGORIA']) {
          categoriaActual = fila['CATEGORIA'].trim();
        }

        const nombreAlimento = fila['ALIMENTO'];
        if (!nombreAlimento) continue;

        const docId = nombreAlimento.toLowerCase().trim().replace(/\s+/g, '-');
        
        const limpiarNumero = (valor: any) => {
          if (!valor) return 0;
          const num = parseFloat(valor.toString().replace(/[^\d.-]/g, ''));
          return isNaN(num) ? 0 : num;
        };

        const nuevoAlimento: Alimento = {
          categoria: categoriaActual,
          alimento: nombreAlimento.trim(),
          maxima: limpiarNumero(fila['CANTIDAD MÁXIMA'] || fila['CANTIDAD MAXIMA'] || fila['CANTIDAD KIMA']),
          minima: limpiarNumero(fila['CANTIDAD MINIMA'] || fila['CANTIDAD MÍNIMA']),
          actual: limpiarNumero(fila['CANTIDAD ACTUAL']),
          porcion: fila['PORCION POR PERSONA'] || fila['PORCIÓN'] || 'Pendiente'
        };

        if (nuevoAlimento.actual === 0) {
          nuevoAlimento.actual = nuevoAlimento.maxima;
        }

        try {
          const docRef = doc(this.firestore, `inventario/${docId}`);
          await setDoc(docRef, nuevoAlimento);
        } catch (error) {
          console.error("Error al subir a Firebase:", error);
        }
      }
      
      alert('¡Importación completada! Los datos ya están en pantalla.');
      event.target.value = ''; 
    };

    reader.readAsArrayBuffer(file);
  }

  exportarExcel() {
    if (!this.inventario || this.inventario.length === 0) {
      alert('No hay datos en la tabla para exportar.');
      return;
    }

    const datosAExportar = this.inventario.map(item => ({
      'CATEGORIA': item.categoria,
      'ALIMENTO': item.alimento,
      'CANTIDAD MÁXIMA': item.maxima,
      'CANTIDAD MÍNIMA': item.minima,
      'CANTIDAD ACTUAL': item.actual,
      'PORCIÓN POR PERSONA': item.porcion,
      'ESTATUS': item.textoEstatus
    }));

    const worksheet = XLSX.utils.json_to_sheet(datosAExportar);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventario MEXCF');
    
    const nombreArchivo = `Inventario_${this.registro.turno || 'General'}_${this.registro.fecha}.xlsx`;
    XLSX.writeFile(workbook, nombreArchivo);
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

  async restarConsumo(item: Alimento) {
    if (item.consumoTurno && item.consumoTurno > 0 && item.id) {
      const nuevaCantidad = Number((item.actual - item.consumoTurno).toFixed(2));
      const cantidadFinal = nuevaCantidad < 0 ? 0 : nuevaCantidad;
      
      const docRef = doc(this.firestore, `inventario/${item.id}`);
      await setDoc(docRef, { actual: cantidadFinal }, { merge: true });
      
      item.consumoTurno = null;
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