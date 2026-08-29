import SwiftUI

struct ContentView: View {
    @State private var target: String = ""
    @State private var retries: String = "3"
    @State private var interval: String = "10"
    @State private var jobId: String? = nil
    @State private var statusText: String = "Hazır"

    // Change this to your deployed server URL
    let serverBase = "https://your-public-url.example.com"

    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("Hedef Numara (E.164)")) {
                    TextField("+90...", text: $target)
                        .keyboardType(.phonePad)
                }
                Section(header: Text("Tekrar sayısı (0 = sonsuz)")) {
                    TextField("3", text: $retries)
                        .keyboardType(.numberPad)
                }
                Section(header: Text("Aralık (saniye)")) {
                    TextField("10", text: $interval)
                        .keyboardType(.numberPad)
                }
                Section {
                    if jobId == nil {
                        Button("Başlat") {
                            startJob()
                        }
                    } else {
                        Button("Durdur") {
                            stopJob()
                        }
                    }
                    Text(statusText).foregroundColor(.secondary)
                }
            }
            .navigationTitle("Auto Redial Client")
        }
    }

    func startJob() {
        guard !target.trimmingCharacters(in: .whitespaces).isEmpty else { statusText = "Numara girin"; return }
        guard let retriesInt = Int(retries), let intervalInt = Int(interval) else { statusText = "Geçersiz parametre"; return }

        let url = URL(string: "\(serverBase)/start")!
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: Any] = ["target": target, "retries": retriesInt, "interval": intervalInt]
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)

        statusText = "Sunucuya başlatma isteği gönderiliyor..."
        URLSession.shared.dataTask(with: req) { data, resp, err in
            if let err = err {
                DispatchQueue.main.async { self.statusText = "Hata: \(err.localizedDescription)" }
                return
            }
            guard let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let jobId = json["jobId"] as? String else {
                DispatchQueue.main.async { self.statusText = "Sunucu hatası veya geçersiz yanıt" }
                return
            }
            DispatchQueue.main.async {
                self.jobId = jobId
                self.statusText = "Job başladı: \(jobId)"
            }
        }.resume()
    }

    func stopJob() {
        guard let jobId = jobId else { return }
        let url = URL(string: "\(serverBase)/stop")!
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["jobId": jobId])

        statusText = "Durduruluyor..."
        URLSession.shared.dataTask(with: req) { data, resp, err in
            if let err = err {
                DispatchQueue.main.async { self.statusText = "Hata: \(err.localizedDescription)" }
                return
            }
            DispatchQueue.main.async {
                self.jobId = nil
                self.statusText = "Durduruldu"
            }
        }.resume()
    }
}
