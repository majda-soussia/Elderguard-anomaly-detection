import torch
import torch.nn as nn


class Autoencoder(nn.Module):
    def __init__(self, input_dim=1440):
        super(Autoencoder, self).__init__()

        # Encoder : compresse 1440 → 32
        self.encoder = nn.Sequential(
            nn.Linear(input_dim, 512),
            nn.BatchNorm1d(512),
            nn.ReLU(),
            nn.Dropout(0.2),

            nn.Linear(512, 128),
            nn.BatchNorm1d(128),
            nn.ReLU(),
            nn.Dropout(0.2),

            nn.Linear(128, 32),
            nn.ReLU()
        )

        # Decoder : reconstruit 32 → 1440
        self.decoder = nn.Sequential(
            nn.Linear(32, 128),
            nn.BatchNorm1d(128),
            nn.ReLU(),
            nn.Dropout(0.2),

            nn.Linear(128, 512),
            nn.BatchNorm1d(512),
            nn.ReLU(),
            nn.Dropout(0.2),

            nn.Linear(512, input_dim),
            nn.Sigmoid()  # Les données sont normalisées entre 0 et 1
        )

    def forward(self, x):
        encoded = self.encoder(x)
        decoded = self.decoder(encoded)
        return decoded

    def encode(self, x):
        """Retourne uniquement la représentation compressée"""
        return self.encoder(x)

    def decode(self, z):
        """Reconstruit depuis la représentation compressée"""
        return self.decoder(z)


if __name__ == "__main__":
    # Test rapide
    model = Autoencoder(input_dim=1440)
    print(model)

    x = torch.randn(8, 1440)  # batch de 8 journées
    output = model(x)
    print(f"\nInput shape:  {x.shape}")
    print(f"Output shape: {output.shape}")
    print(" Autoencoder fonctionne correctement !")

























