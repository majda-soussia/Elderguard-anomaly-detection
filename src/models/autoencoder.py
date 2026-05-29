import torch
import torch.nn as nn

class Autoencoder(nn.Module):
    def __init__(self, input_dim, latent_dim=32):
        super(Autoencoder, self).__init__()
        self.input_dim = input_dim
        self.latent_dim = latent_dim

        # Encoder
        # input_dim should be 1440
        self.encoder = nn.Sequential(
            nn.Conv1d(1, 16, kernel_size=3, stride=2, padding=1), # Output: (batch, 16, 720)
            nn.ReLU(),
            nn.Conv1d(16, 32, kernel_size=3, stride=2, padding=1), # Output: (batch, 32, 360)
            nn.ReLU(),
            nn.Conv1d(32, 64, kernel_size=3, stride=2, padding=1), # Output: (batch, 64, 180)
            nn.ReLU(),
            nn.Conv1d(64, 128, kernel_size=3, stride=2, padding=1), # Output: (batch, 128, 90)
            nn.ReLU(),
            nn.Flatten(),
            nn.Linear(128 * (input_dim // 16), latent_dim) 
        )

        # Decoder
        self.decoder = nn.Sequential(
            nn.Linear(latent_dim, 128 * (input_dim // 16)),
            nn.ReLU(),
            nn.Unflatten(1, (128, input_dim // 16)),
            nn.ConvTranspose1d(128, 64, kernel_size=3, stride=2, padding=1, output_padding=1), # Output: (batch, 64, 180)
            nn.ReLU(),
            nn.ConvTranspose1d(64, 32, kernel_size=3, stride=2, padding=1, output_padding=1), # Output: (batch, 32, 360)
            nn.ReLU(),
            nn.ConvTranspose1d(32, 16, kernel_size=3, stride=2, padding=1, output_padding=1), # Output: (batch, 16, 720)
            nn.ReLU(),
            nn.ConvTranspose1d(16, 1, kernel_size=3, stride=2, padding=1, output_padding=1), # Output: (batch, 1, 1440)
            nn.Sigmoid() 
        )

    def forward(self, x):
        if x.dim() == 2:
            x = x.unsqueeze(1)
        
        encoded = self.encoder(x)
        decoded = self.decoder(encoded)
        decoded = decoded.squeeze(1)
        return decoded