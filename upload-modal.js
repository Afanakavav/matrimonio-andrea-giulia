class UploadModal {
  constructor() {
    this.modal = document.getElementById("uploadModal");
    this.uploadBtn = document.getElementById("uploadBtn");
    this.fileInput = document.getElementById("fileInput");
    this.uploadArea = document.getElementById("uploadArea");
    this.previewGrid = document.getElementById("previewGrid");
    this.progressFill = document.getElementById("progressFill");
    this.progressText = document.getElementById("progressText");
    this.uploadProgress = document.getElementById("uploadProgress");
    this.uploadPreview = document.getElementById("uploadPreview");
    this.uploadButton = document.querySelector(".btn-upload");
    this.cancelBtn = document.getElementById("cancelBtn");

    this.selectedFiles = [];
    this.uploading = false;

    this.init();
  }

  init() {
    this.uploadBtn.addEventListener("click", () => this.openModal());
    document.querySelector(".close-modal").addEventListener("click", () => this.closeModal());
    this.cancelBtn.addEventListener("click", () => this.closeModal());

    this.fileInput.addEventListener("change", (e) => this.handleFileSelect(e.target.files));

    this.uploadArea.addEventListener("click", () => this.fileInput.click());
    this.uploadArea.addEventListener("dragover", (e) => this.handleDragOver(e));
    this.uploadArea.addEventListener("dragleave", (e) => this.handleDragLeave(e));
    this.uploadArea.addEventListener("drop", (e) => this.handleDrop(e));

    this.uploadButton.addEventListener("click", () => this.uploadFiles());

    this.modal.addEventListener("click", (e) => {
      if (e.target === this.modal) this.closeModal();
    });
  }

  openModal() {
    if (!isUploadEnabled()) {
      alert(
        "Il caricamento di foto e video e disponibile solo durante il matrimonio e per una settimana successiva."
      );
      return;
    }

    this.modal.classList.add("show");
    document.body.style.overflow = "hidden";
  }

  closeModal() {
    this.modal.classList.remove("show");
    document.body.style.overflow = "auto";
    this.resetModal();
  }

  resetModal() {
    this.selectedFiles = [];
    this.previewGrid.innerHTML = "";
    this.uploadPreview.style.display = "none";
    this.uploadProgress.style.display = "none";
    this.uploadButton.disabled = true;
    this.uploading = false;
    this.fileInput.value = "";
  }

  handleDragOver(e) {
    e.preventDefault();
    this.uploadArea.classList.add("dragover");
  }

  handleDragLeave(e) {
    e.preventDefault();
    this.uploadArea.classList.remove("dragover");
  }

  handleDrop(e) {
    e.preventDefault();
    this.uploadArea.classList.remove("dragover");
    this.handleFileSelect(e.dataTransfer.files);
  }

  handleFileSelect(files) {
    const validFiles = Array.from(files).filter((file) => this.validateFile(file));

    if (validFiles.length === 0) return;

    // Count photos and videos separately
    const photoCount =
      this.selectedFiles.filter((f) => f.type.startsWith("image/")).length +
      validFiles.filter((f) => f.type.startsWith("image/")).length;
    const videoCount =
      this.selectedFiles.filter((f) => f.type.startsWith("video/")).length +
      validFiles.filter((f) => f.type.startsWith("video/")).length;

    // Check limits: max 10 photos + 3 videos
    if (photoCount > 10 || videoCount > 3) {
      alert(
        `Limite caricamento:\n- Massimo 10 foto per upload\n- Massimo 3 video per upload\n\nAttualmente:\n- ${photoCount} foto\n- ${videoCount} video`
      );
      return;
    }

    this.selectedFiles = [...this.selectedFiles, ...validFiles];
    this.updatePreview();
    this.uploadButton.disabled = false;
  }

  validateFile(file) {
    if (file.size > WEDDING_CONFIG.maxFileSize) {
      alert("Il file " + file.name + " e troppo grande. Dimensione massima: 100MB");
      return false;
    }

    if (!WEDDING_CONFIG.allowedTypes.includes(file.type)) {
      alert("Il file " + file.name + " non e supportato. Formati supportati: JPG, PNG, MP4, MOV");
      return false;
    }

    return true;
  }

  updatePreview() {
    this.previewGrid.innerHTML = "";
    this.uploadPreview.style.display = "block";

    this.selectedFiles.forEach((file, index) => {
      const previewItem = document.createElement("div");
      previewItem.className = "preview-item";

      const removeBtn = document.createElement("button");
      removeBtn.className = "remove-btn";
      removeBtn.innerHTML = "×";
      removeBtn.onclick = () => this.removeFile(index);

      if (file.type.startsWith("image/")) {
        const img = document.createElement("img");
        img.src = URL.createObjectURL(file);
        previewItem.appendChild(img);
      } else if (file.type.startsWith("video/")) {
        const video = document.createElement("video");
        video.src = URL.createObjectURL(file);
        video.muted = true;
        video.loop = true;
        previewItem.appendChild(video);
      }

      previewItem.appendChild(removeBtn);
      this.previewGrid.appendChild(previewItem);
    });
  }

  removeFile(index) {
    this.selectedFiles.splice(index, 1);
    this.updatePreview();

    if (this.selectedFiles.length === 0) {
      this.uploadPreview.style.display = "none";
      this.uploadButton.disabled = true;
    }
  }

  async uploadFiles() {
    if (this.uploading || this.selectedFiles.length === 0) return;

    this.uploading = true;
    this.uploadProgress.style.display = "block";
    this.uploadButton.disabled = true;

    let uploadedCount = 0;
    const totalFiles = this.selectedFiles.length;

    try {
      for (let i = 0; i < this.selectedFiles.length; i++) {
        const file = this.selectedFiles[i];
        const progress = ((i + 1) / totalFiles) * 100;

        this.updateProgress(
          progress,
          "Caricamento " + (i + 1) + " di " + totalFiles + ": " + file.name
        );

        // Compress image if needed
        let fileToUpload = file;
        if (file.type.startsWith("image/")) {
          try {
            fileToUpload = await this.compressImage(file);
            console.log(`Immagine compressa: ${file.size} → ${fileToUpload.size} bytes`);
          } catch (error) {
            console.warn("Compressione fallita, uso file originale:", error);
          }
        }

        const storageRef = storage.ref("wedding-media/" + Date.now() + "-" + file.name);
        const snapshot = await storageRef.put(fileToUpload);
        const downloadURL = await snapshot.ref.getDownloadURL();

        await db.collection("wedding-media").add({
          fileName: file.name,
          fileType: file.type,
          fileSize: fileToUpload.size,
          downloadURL: downloadURL,
          uploadDate: firebase.firestore.FieldValue.serverTimestamp(),
          storagePath: snapshot.ref.fullPath,
          hashtag: "#AndreaGiulia2026",
        });

        uploadedCount++;
      }

      this.updateProgress(100, "Caricamento completato!");

      setTimeout(() => {
        alert(
          `Perfetto! ${uploadedCount} file caricati con successo.\n\nRicorda di usare l'hashtag #AndreaGiulia2026 se condividi su Instagram! 📸`
        );
        this.closeModal();
      }, 1000);
    } catch (error) {
      console.error("Errore durante il caricamento:", error);
      alert("Si è verificato un errore durante il caricamento. Riprova più tardi.");
      this.uploading = false;
      this.uploadButton.disabled = false;
    }
  }

  async compressImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        const img = new Image();

        img.onload = () => {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");

          // Max dimensions (maintain aspect ratio)
          const MAX_WIDTH = 1920;
          const MAX_HEIGHT = 1920;

          let width = img.width;
          let height = img.height;

          // Resize if needed
          if (width > MAX_WIDTH || height > MAX_HEIGHT) {
            const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
            width = width * ratio;
            height = height * ratio;
          }

          canvas.width = width;
          canvas.height = height;

          ctx.drawImage(img, 0, 0, width, height);

          // Convert to blob with quality 0.8 (JPEG)
          canvas.toBlob(
            (blob) => {
              if (blob && blob.size < file.size) {
                // Use compressed version only if smaller
                resolve(new File([blob], file.name, { type: "image/jpeg" }));
              } else {
                // Use original if compression doesn't help
                resolve(file);
              }
            },
            "image/jpeg",
            0.8
          );
        };

        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = e.target.result;
      };

      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  }

  updateProgress(percentage, text) {
    this.progressFill.style.width = percentage + "%";
    this.progressText.textContent = text;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new UploadModal();
});
