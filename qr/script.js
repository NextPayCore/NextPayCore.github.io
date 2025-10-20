$(document).ready(function() {
    // Biến toàn cục
    let isScanning = false;
    let deviceDatabase = {};
    let currentScanner = null;
    let qrScannerInstance = null;
    let scanTimeout = null;
    
    // Load database từ file JSON
    async function loadDatabase() {
        try {
            const response = await fetch('database.json');
            deviceDatabase = await response.json();
            console.log('Database loaded:', deviceDatabase);
        } catch (error) {
            console.error('Lỗi khi tải database:', error);
            showError('Không thể tải cơ sở dữ liệu thiết bị');
        }
    }
    
    // Khởi tạo scanner với QuaggaJS
    function initQuaggaScanner() {
        console.log('Initializing QuaggaJS scanner...');
        
        const config = {
            inputStream: {
                name: "Live",
                type: "LiveStream",
                target: document.querySelector('#scanner'),
                constraints: {
                    width: { min: 320, ideal: 640, max: 800 },
                    height: { min: 240, ideal: 480, max: 600 },
                    facingMode: "environment"
                }
            },
            locator: {
                patchSize: "medium",
                halfSample: true
            },
            numOfWorkers: 2,
            frequency: 10,
            decoder: {
                readers: [
                    "code_128_reader",
                    "ean_reader",
                    "code_39_reader"
                ]
            },
            locate: true
        };
        
        Quagga.init(config, function(err) {
            if (err) {
                console.error('QuaggaJS failed:', err);
                console.log('Trying QR Scanner as fallback...');
                setTimeout(() => {
                    if (typeof QrScanner !== 'undefined') {
                        initQRScanner();
                    } else {
                        showError('Cả QuaggaJS và QR Scanner đều không hoạt động');
                    }
                }, 500);
                return;
            }
            
            console.log("QuaggaJS initialized successfully");
            currentScanner = 'quagga';
            Quagga.start();
            isScanning = true;
            updateUI();
            
            Quagga.onDetected(function(result) {
                if (result && result.codeResult) {
                    const scannedCode = result.codeResult.code;
                    console.log('QuaggaJS detected:', scannedCode);
                    processScannedCode(scannedCode);
                }
            });
        });
    }
    
    // Khởi tạo QR Scanner fallback
    function initQRScanner() {
        console.log('Initializing QR Scanner fallback...');
        
        if (typeof QrScanner === 'undefined') {
            showError('QR Scanner không khả dụng. Vui lòng tải lại trang.');
            return;
        }
        
        try {
            // Dừng scanner cũ nếu có
            if (qrScannerInstance) {
                qrScannerInstance.destroy();
                qrScannerInstance = null;
            }
            
            const video = document.createElement('video');
            video.style.width = '100%';
            video.style.height = '300px';
            video.style.objectFit = 'cover';
            video.style.borderRadius = '10px';
            video.style.maxWidth = '100%';
            video.style.maxHeight = '300px';
            
            // Thay thế element scanner
            const scannerElement = document.querySelector('#scanner');
            scannerElement.innerHTML = '';
            scannerElement.appendChild(video);
            
            qrScannerInstance = new QrScanner(video, result => {
                console.log('QR Scanner detected:', result);
                processScannedCode(result);
            }, {
                onDecodeError: (error) => {
                    // Không log để tránh spam
                },
                highlightScanRegion: true,
                highlightCodeOutline: true
            });
            
            qrScannerInstance.start().then(() => {
                currentScanner = 'qr-scanner';
                isScanning = true;
                updateUI();
                console.log('QR Scanner started successfully');
                
                // Thêm timeout để tự động thử scanner khác nếu không scan được
                scanTimeout = setTimeout(() => {
                    if (isScanning && currentScanner === 'qr-scanner') {
                        console.log('QR Scanner timeout, trying QuaggaJS...');
                        switchScanner();
                    }
                }, 10000); // 10 giây timeout
                
            }).catch(err => {
                console.error('QR Scanner failed:', err);
                console.log('Trying QuaggaJS as fallback...');
                setTimeout(() => {
                    if (typeof Quagga !== 'undefined') {
                        initQuaggaScanner();
                    } else {
                        showError('Không thể khởi tạo camera. Vui lòng kiểm tra quyền truy cập camera.');
                    }
                }, 500);
            });
            
        } catch (error) {
            console.error('QR Scanner initialization failed:', error);
            showError('Không thể khởi tạo QR Scanner. Vui lòng tải lại trang.');
        }
    }
    
    // Khởi tạo scanner chính
    function initScanner() {
        if (isScanning) return;
        
        console.log('Starting scanner initialization...');
        
        // Ưu tiên QR Scanner vì hoạt động tốt hơn
        if (typeof QrScanner !== 'undefined') {
            console.log('Trying QR Scanner first...');
            initQRScanner();
        } else if (typeof Quagga !== 'undefined') {
            console.log('QR Scanner not available, trying QuaggaJS...');
            initQuaggaScanner();
        } else {
            console.error('No scanner libraries available');
            showError('Không có thư viện scanner nào khả dụng. Vui lòng tải lại trang.');
        }
    }
    
    
    // Dừng scanner
    function stopScanner() {
        if (isScanning) {
            if (currentScanner === 'quagga') {
                Quagga.stop();
            } else if (currentScanner === 'qr-scanner' && qrScannerInstance) {
                qrScannerInstance.destroy();
                qrScannerInstance = null;
            }
            
            // Clear timeout
            if (scanTimeout) {
                clearTimeout(scanTimeout);
                scanTimeout = null;
            }
            
            isScanning = false;
            currentScanner = null;
            updateUI();
        }
    }
    
    // Xử lý mã đã quét
    function processScannedCode(deviceCode) {
        stopScanner();
        
        // Tìm thiết bị trong database
        const lotInfo = findDeviceInDatabase(deviceCode.data);
        
        if (lotInfo) {
            showResult(deviceCode.data, lotInfo);
        } else {
            showError(`Thiết bị "${deviceCode.data}" không tìm thấy trong hệ thống`);
        }
    }
    
    // Tìm thiết bị trong database
    function findDeviceInDatabase(deviceCode) {
        for (const [lotId, devices] of Object.entries(deviceDatabase)) {
            if (devices.includes(deviceCode)) {
                return {
                    lotId: lotId,
                    lotName: getLotDisplayName(lotId),
                    position: getLotPosition(lotId)
                };
            }
        }
        return null;
    }
    
    // Lấy tên hiển thị của lô
    function getLotDisplayName(lotId) {
        const lotNames = {
            'LO_1': 'Lô 1',
            'LO_2': 'Lô 2'
        };
        return lotNames[lotId] || lotId;
    }
    
    // Lấy vị trí của lô
    function getLotPosition(lotId) {
        const positions = {
            'LO_1': 'Khu vực A - Tầng 1',
            'LO_2': 'Khu vực B - Tầng 2'
        };
        return positions[lotId] || 'Chưa xác định';
    }
    
    // Hiển thị kết quả trong modal
    function showResult(deviceCode, lotInfo) {
        $('#deviceCode').text(deviceCode);
        $('#lotName').text(lotInfo.lotName);
        $('#lotPosition').text(lotInfo.position);
        
        // Hiển thị modal
        $('#resultModal').modal('show');
        $('#errorSection').hide();
    }
    
    // Hiển thị lỗi trong modal
    function showError(message) {
        $('#errorMessage').text(message);
        $('#errorModal').modal('show');
    }
    
    // Cập nhật UI
    function updateUI() {
        if (isScanning) {
            $('#stopScan').show();
            $('#overlay').show();
            $('#scanStatus').hide();
        } else {
            $('#stopScan').hide();
            $('#overlay').hide();
            $('#scanStatus').hide();
        }
    }
    
    // Reset về trạng thái ban đầu
    function resetToInitialState() {
        stopScanner();
        $('#resultSection').hide();
        $('#errorSection').hide();
        updateUI();
        
        // Tự động bắt đầu scan lại sau 1 giây
        setTimeout(() => {
            initScanner();
        }, 1000);
    }
    
    // Event handlers
    $('#stopScan').click(function() {
        stopScanner();
    });
    
    $('#modalOK').click(function() {
        // Đóng modal và tiếp tục scan
        $('#resultModal').modal('hide');
    });
    
    // Tự động tiếp tục scan khi modal đóng
    $('#resultModal').on('hidden.bs.modal', function() {
        resetToInitialState();
    });
    
    // Event handler cho error modal
    $('#errorModalOK').click(function() {
        $('#errorModal').modal('hide');
    });
    
    // Tự động tiếp tục scan khi error modal đóng
    $('#errorModal').on('hidden.bs.modal', function() {
        resetToInitialState();
    });
    
    // Kiểm tra quyền camera và tự động bắt đầu scan
    function checkCameraPermission() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showError('Trình duyệt không hỗ trợ camera. Vui lòng sử dụng Chrome, Firefox hoặc Safari mới nhất.');
            return;
        }
        
        navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: "environment",
                width: { ideal: 1280 },
                height: { ideal: 720 }
            } 
        })
        .then(function(stream) {
            // Có quyền camera, dừng stream test
            stream.getTracks().forEach(track => track.stop());
            console.log('Camera permission granted, starting scanner...');
            
            // Tự động bắt đầu scan
            setTimeout(() => {
                initScanner();
            }, 500);
        })
        .catch(function(error) {
            console.error('Camera permission denied:', error);
            showError('Vui lòng cấp quyền truy cập camera để sử dụng tính năng quét QR. Nếu đã cấp quyền, vui lòng tải lại trang.');
        });
    }
    
    // Khởi tạo ứng dụng
    async function initApp() {
        console.log('Initializing app...');
        
        await loadDatabase();
        checkCameraPermission();
        updateUI();
    }
    
    // Khởi tạo khi trang load
    initApp();
    
    // Xử lý lỗi toàn cục
    window.addEventListener('error', function(e) {
        console.error('Global error:', e.error);
    });
    
    // Xử lý khi trang bị đóng
    window.addEventListener('beforeunload', function() {
        if (isScanning) {
            stopScanner();
        }
    });
});
