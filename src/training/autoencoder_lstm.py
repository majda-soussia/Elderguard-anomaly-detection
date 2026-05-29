import torch
import torch.nn as nn


class LSTMAutoencoder(nn.Module):
    def __init__(self, input_dim=1440, hidden_dim=128, latent_dim=32, num_layers=2):
        super(LSTMAutoencoder, self).__init__()

        self.input_dim  = input_dim
        self.hidden_dim = hidden_dim
        self.latent_dim = latent_dim
        self.num_layers = num_layers

        # ── ENCODER LSTM
        # Entrée : séquence de 1440 pas de temps, chaque pas = 1 valeur
        self.encoder_lstm = nn.LSTM(
            input_size=1,
            hidden_size=hidden_dim,
            num_layers=num_layers,
            batch_first=True,
            dropout=0.2
        )

        # Compresser hidden_dim → latent_dim
        self.encoder_fc = nn.Linear(hidden_dim, latent_dim)

        # ── DECODER LSTM
        # Décompresser latent_dim → hidden_dim
        self.decoder_fc = nn.Linear(latent_dim, hidden_dim)

        self.decoder_lstm = nn.LSTM(
            input_size=hidden_dim,
            hidden_size=hidden_dim,
            num_layers=num_layers,
            batch_first=True,
            dropout=0.2
        )

        # Reconstruire hidden_dim → 1 valeur par pas de temps
        self.output_fc = nn.Linear(hidden_dim, 1)
        self.sigmoid   = nn.Sigmoid()

    def forward(self, x):
        batch_size = x.size(0)

        # ── ENCODE
        # x : (batch, 1440) → (batch, 1440, 1)
        x_seq = x.unsqueeze(2)

        # LSTM encoder : (batch, 1440, 1) → (batch, 1440, hidden_dim)
        enc_out, (hidden, cell) = self.encoder_lstm(x_seq)

        # Prendre le dernier état caché : (batch, hidden_dim)
        last_hidden = enc_out[:, -1, :]

        # Comprimer vers l'espace latent : (batch, latent_dim)
        latent = self.encoder_fc(last_hidden)

        # ── DECODE
        # Décompresser : (batch, latent_dim) → (batch, hidden_dim)
        dec_input = self.decoder_fc(latent)

        # Répéter pour chaque pas de temps : (batch, hidden_dim) → (batch, 1440, hidden_dim)
        dec_input_seq = dec_input.unsqueeze(1).repeat(1, self.input_dim, 1)

        # LSTM decoder : (batch, 1440, hidden_dim) → (batch, 1440, hidden_dim)
        dec_out, _ = self.decoder_lstm(dec_input_seq)

        # Reconstruire : (batch, 1440, hidden_dim) → (batch, 1440, 1) → (batch, 1440)
        output = self.output_fc(dec_out)
        output = self.sigmoid(output)
        output = output.squeeze(2)

        return output

    def encode(self, x):
        x_seq   = x.unsqueeze(2)
        enc_out, _ = self.encoder_lstm(x_seq)
        last_hidden = enc_out[:, -1, :]
        return self.encoder_fc(last_hidden)


if __name__ == "__main__":
    model  = LSTMAutoencoder(input_dim=1440, hidden_dim=128, latent_dim=32, num_layers=2)
    x      = torch.randn(4, 1440)
    output = model(x)
    print(f"Input  shape: {x.shape}")
    print(f"Output shape: {output.shape}")
    print("LSTM Autoencoder fonctionne !")

    total_params = sum(p.numel() for p in model.parameters())
    print(f"Total parameters: {total_params:,}")